import { NotFoundError } from '@relay/engine';
import type { MessageId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  at,
  buildMailbox,
  buildMessage,
  buildThread,
  newId,
  seedAccount,
} from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';

interface PlacementRow extends Record<string, unknown> {
  readonly message_id: string;
  readonly mailbox_id: string;
  readonly uid: string;
}

describe('PgMessageRepository placements', () => {
  const context = usePgTestContext();

  const placementsOf = async (messageIds: readonly MessageId[]) => {
    const result = await context.db.execute<PlacementRow>(
      sql`select message_id, mailbox_id, uid::text from message_placements where message_id in ${[...messageIds]} order by uid`,
    );
    return result.rows.map((row) => ({
      messageId: row.message_id,
      mailboxId: row.mailbox_id,
      uid: Number(row.uid),
    }));
  };

  const aliasOf = async (messageId: MessageId): Promise<MessageId> => {
    const aliasId = `alias-${messageId}` as MessageId;
    await context.db.execute(
      sql`insert into message_aliases (alias_id, message_id) values (${aliasId}, ${messageId})`,
    );
    return aliasId;
  };

  const seedTwo = async () => {
    const seeded = await seedAccount(context.repositories);
    const thread = await context.repositories.threads.upsert(buildThread(seeded.account.id));
    const first = buildMessage(thread, seeded.mailboxes.inbox, { uid: 7 });
    const second = buildMessage(thread, seeded.mailboxes.inbox, { uid: 9 });
    const stored = await context.repositories.messages.upsert(first, new Map());
    await context.repositories.messages.upsert(second, new Map());
    return { seeded, thread, first, second, stored };
  };

  it('stores one placement per upserted message and returns it on reads', async () => {
    const { seeded, thread, first, second, stored } = await seedTwo();
    const { inbox } = seeded.mailboxes;

    await context.repositories.messages.upsert({ ...first, uid: 8 }, new Map());

    expect(stored.placements).toEqual([{ mailboxId: inbox.id, uid: 7 }]);
    await expect(placementsOf([first.id, second.id])).resolves.toEqual([
      { messageId: first.id, mailboxId: inbox.id, uid: 8 },
      { messageId: second.id, mailboxId: inbox.id, uid: 9 },
    ]);
    await expect(
      context.repositories.messages.listByThread(seeded.user.id, thread.id),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: first.id, placements: [{ mailboxId: inbox.id, uid: 8 }] }),
        expect.objectContaining({ id: second.id, placements: [{ mailboxId: inbox.id, uid: 9 }] }),
      ]),
    );
  });

  it('rewrites the placement on move and reads locations through it', async () => {
    const { seeded, first, second } = await seedTwo();
    const { inbox, sent } = seeded.mailboxes;

    await context.repositories.messages.move(first.id, { mailboxId: sent.id, uid: 0 });

    await expect(placementsOf([first.id, second.id])).resolves.toEqual([
      { messageId: first.id, mailboxId: sent.id, uid: 0 },
      { messageId: second.id, mailboxId: inbox.id, uid: 9 },
    ]);
    await expect(
      context.repositories.messages.findByLocation({ mailboxId: inbox.id, uid: 7 }),
    ).resolves.toBeNull();
    await expect(
      context.repositories.messages.findByLocation({ mailboxId: sent.id, uid: 0 }),
    ).resolves.toMatchObject({ id: first.id, placements: [{ mailboxId: sent.id, uid: 0 }] });
    await expect(context.repositories.messages.listUids(inbox.id)).resolves.toEqual([9]);
    await expect(context.repositories.messages.listUids(sent.id)).resolves.toEqual([]);
  });

  it('deletes the messages and placements at the given uids', async () => {
    const { seeded, thread, first, second } = await seedTwo();
    const { inbox } = seeded.mailboxes;

    await expect(context.repositories.messages.deleteByUids(inbox.id, [7, 8])).resolves.toEqual([
      thread.id,
    ]);

    await expect(placementsOf([first.id, second.id])).resolves.toEqual([
      { messageId: second.id, mailboxId: inbox.id, uid: 9 },
    ]);
    await expect(
      context.repositories.messages.findById(seeded.user.id, first.id),
    ).resolves.toBeNull();
  });

  it('resolves a merged message id through its alias, also for reply drafts', async () => {
    const { seeded, first } = await seedTwo();
    const alias = await aliasOf(first.id);
    const stranger = await seedAccount(context.repositories);
    const { sent } = seeded.mailboxes;

    await context.repositories.messages.updateFlags(alias, {
      seen: true,
      flagged: true,
      answered: false,
    });
    await context.repositories.messages.move(alias, { mailboxId: sent.id, uid: 3 });

    await expect(
      context.repositories.messages.findById(seeded.user.id, alias),
    ).resolves.toMatchObject({
      id: first.id,
      flags: { seen: true, flagged: true, answered: false },
      placements: [{ mailboxId: sent.id, uid: 3 }],
    });
    await expect(context.repositories.messages.findHeaders(seeded.user.id, alias)).resolves.toEqual(
      new Map(),
    );
    const draft = {
      id: newId('draft'),
      accountId: seeded.account.id,
      to: [],
      cc: [],
      bcc: [],
      subject: 'Re',
      body: '',
      inReplyToThreadId: null,
      inReplyToMessageId: alias,
      attachments: [],
      createdAt: at(0),
      updatedAt: at(0),
    };
    const created = await context.repositories.drafts.create(seeded.user.id, draft);
    const plain = await context.repositories.drafts.create(seeded.user.id, {
      ...draft,
      id: newId('draft'),
      inReplyToMessageId: null,
    });
    const updated = await context.repositories.drafts.update(
      seeded.user.id,
      plain.id,
      { inReplyToMessageId: alias },
      { expected: plain.updatedAt, next: at(1) },
    );

    expect(created.inReplyToMessageId).toBe(first.id);
    expect(updated?.inReplyToMessageId).toBe(first.id);
    await expect(
      context.repositories.drafts.create(stranger.user.id, {
        ...draft,
        id: newId('draft'),
        accountId: stranger.account.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cascades placements and aliases when the account goes', async () => {
    const { seeded, first, second } = await seedTwo();
    await aliasOf(first.id);

    await context.repositories.accounts.delete(seeded.user.id, seeded.account.id);

    await expect(placementsOf([first.id, second.id])).resolves.toEqual([]);
    const aliases = await context.db.execute(
      sql`select alias_id from message_aliases where message_id = ${first.id}`,
    );
    expect(aliases.rows).toEqual([]);
  });

  it('cascades placements when their mailbox goes', async () => {
    const { seeded, thread, first, second } = await seedTwo();
    const [folder] = await context.repositories.mailboxes.upsertMany(seeded.account.id, [
      buildMailbox(seeded.account.id, 'custom', { path: 'Projekty', name: 'Projekty' }),
    ]);
    expect(folder).toBeDefined();
    const filed = buildMessage(thread, folder ?? seeded.mailboxes.sent, { uid: 4 });
    await context.repositories.messages.upsert(filed, new Map());

    await context.repositories.mailboxes.deleteMissing(seeded.account.id, ['INBOX', 'sent']);

    await expect(placementsOf([first.id, second.id, filed.id])).resolves.toEqual([
      { messageId: first.id, mailboxId: seeded.mailboxes.inbox.id, uid: 7 },
      { messageId: second.id, mailboxId: seeded.mailboxes.inbox.id, uid: 9 },
    ]);
  });
});
