import type { Mailbox, MessageId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { newId, seedAccount } from './support/fixtures';
import { usePgTestContext } from './support/pg-test-context';
import {
  at,
  expectMirrorParity,
  gmailIdentity,
  messageCount,
  newMessage,
  NO_HEADERS,
  type PlacementScene,
  placementRows,
  placeRequest,
  seedPlacementScene,
  sortedPlacements,
  storedState,
} from './support/place-fixtures';

describe('PgMessageRepository placement removal', () => {
  const context = usePgTestContext();

  const scene = async (): Promise<PlacementScene> =>
    seedPlacementScene(context.repositories, await seedAccount(context.repositories));

  const gmailMessage = async (placed: PlacementScene): Promise<MessageId> => {
    const { messages } = context.repositories;
    const message = newMessage(placed, at(placed.boxes.inbox, 5), { emailId: 'gm-1' });
    await messages.upsert(message, NO_HEADERS);
    await messages.place(placeRequest(gmailIdentity(placed, placed.boxes.allMail, 40), null));
    return message.id;
  };

  const aliasOf = async (messageId: MessageId): Promise<MessageId> => {
    const aliasId = `alias-${messageId}` as MessageId;
    await context.db.execute(
      sql`insert into message_aliases (alias_id, message_id) values (${aliasId}, ${messageId})`,
    );
    return aliasId;
  };

  const labelRows = async (messageId: MessageId): Promise<number> => {
    const result = await context.db.execute<{ count: number }>(
      sql`select count(*)::int as count from message_labels where message_id = ${messageId}`,
    );
    return result.rows[0]?.count ?? 0;
  };

  const read = (placed: PlacementScene, messageId: MessageId) =>
    context.repositories.messages.findById(placed.seeded.user.id, messageId);

  it('expunges one placement, keeps the message and deletes it with the last one', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox, allMail } = placed.boxes;
    const id = await gmailMessage(placed);
    const labelId = newId('label');
    await context.repositories.labels.upsert({
      id: labelId,
      accountId: placed.seeded.account.id,
      name: 'Faktúry',
      color: null,
      kind: 'gmail',
      remoteName: 'Faktúry',
    });
    await messages.addLabel(id, labelId);
    const alias = await aliasOf(id);

    await expect(messages.deleteByUids(inbox.id, [5, 0])).resolves.toEqual([placed.thread.id]);
    await expectMirrorParity(context.db, placed.boxes, await read(placed, id));
    await expect(storedState(context.db, id)).resolves.toMatchObject(at(allMail, 40));

    await expect(messages.deleteByUids(allMail.id, [40])).resolves.toEqual([placed.thread.id]);
    await expect(messageCount(context.db, placed.seeded.account.id)).resolves.toBe(0);
    await expect(placementRows(context.db, placed.seeded.account.id)).resolves.toEqual([]);
    await expect(labelRows(id)).resolves.toBe(0);
    await expect(read(placed, alias)).resolves.toBeNull();
  });

  it('ignores pending uids on expunge and lists only known uids', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { allMail, spam } = placed.boxes;
    const id = await gmailMessage(placed);
    await messages.movePlacement(id, { from: allMail.id, to: at(spam, 0), keepSource: true });

    await expect(messages.deleteByUids(spam.id, [0])).resolves.toEqual([]);
    await expect(messages.listUids(spam.id)).resolves.toEqual([]);
    await expect(messages.listUids(allMail.id)).resolves.toEqual([40]);
    await expect(placementRows(context.db, placed.seeded.account.id)).resolves.toHaveLength(3);
  });

  it('removes one placement, pending or not, through an alias', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox, allMail, spam } = placed.boxes;
    const id = await gmailMessage(placed);
    await messages.movePlacement(id, { from: inbox.id, to: at(spam, 0), keepSource: true });
    const alias = await aliasOf(id);

    const kept = { threadIds: [placed.thread.id], retired: false };
    await expect(messages.removePlacement(alias, spam.id)).resolves.toEqual(kept);
    await expect(messages.removePlacement(id, spam.id)).resolves.toEqual({
      threadIds: [],
      retired: false,
    });
    await expect(messages.removePlacement(id, inbox.id)).resolves.toEqual(kept);
    await expectMirrorParity(context.db, placed.boxes, await read(placed, id));
    await expect(messages.removePlacement(id, allMail.id)).resolves.toEqual({
      threadIds: [placed.thread.id],
      retired: true,
    });
    await expect(messageCount(context.db, placed.seeded.account.id)).resolves.toBe(0);
  });

  it('lets two messages fall back to pending mirrors in one mailbox', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox, sent, allMail } = placed.boxes;
    const pendingIn = async (source: Mailbox, uid: number) => {
      const message = newMessage(placed, at(source, uid), { threadId: newId('thread') });
      await messages.upsert(message, NO_HEADERS);
      await messages.movePlacement(message.id, {
        from: source.id,
        to: at(inbox, 0),
        keepSource: true,
      });
      return message;
    };
    const a = await pendingIn(allMail, 40);
    const b = await pendingIn(allMail, 41);
    const c = await pendingIn(sent, 3);
    const d = await pendingIn(sent, 4);

    await expect(messages.deleteByUids(allMail.id, [40, 41])).resolves.toEqual(
      [a.threadId, b.threadId].sort(),
    );
    await expect(messages.removePlacement(c.id, sent.id)).resolves.toEqual({
      threadIds: [c.threadId],
      retired: false,
    });
    await expect(messages.removePlacement(d.id, sent.id)).resolves.toEqual({
      threadIds: [d.threadId],
      retired: false,
    });

    for (const message of [a, b, c, d]) {
      await expect(storedState(context.db, message.id)).resolves.toMatchObject(at(inbox, 0));
    }
    await expect(placementRows(context.db, placed.seeded.account.id)).resolves.toHaveLength(4);
  });

  it('forgets a mailbox with its pending placements before the mailbox row goes', async () => {
    const placed = await scene();
    const { messages, mailboxes } = context.repositories;
    const { inbox, sent, allMail, spam } = placed.boxes;
    const id = await gmailMessage(placed);
    const only = newMessage(placed, at(inbox, 0), { threadId: newId('thread'), emailId: 'gm-2' });
    await messages.upsert(only, NO_HEADERS);
    await expect(storedState(context.db, id)).resolves.toMatchObject(at(inbox, 5));

    await expect(messages.forgetMailbox(inbox.id)).resolves.toEqual(
      [placed.thread.id, only.threadId].sort(),
    );
    await mailboxes.deleteMissing(placed.seeded.account.id, [sent.path, allMail.path, spam.path]);

    await expect(read(placed, id)).resolves.toMatchObject({
      placements: [at(allMail, 40)],
      mailboxId: allMail.id,
      uid: 40,
    });
    await expect(read(placed, only.id)).resolves.toBeNull();
  });

  it('moves the mirror to the best placement so deleting the old primary mailbox keeps it', async () => {
    const placed = await scene();
    const { messages, mailboxes } = context.repositories;
    const { inbox, sent, allMail, spam } = placed.boxes;
    const message = newMessage(placed, at(allMail, 40), { emailId: 'gm-1' });
    await messages.upsert(message, NO_HEADERS);
    await messages.place(placeRequest(gmailIdentity(placed, inbox, 5), null));
    await expect(storedState(context.db, message.id)).resolves.toMatchObject(at(inbox, 5));

    await mailboxes.deleteMissing(placed.seeded.account.id, [inbox.path, sent.path, spam.path]);

    await expect(read(placed, message.id)).resolves.toMatchObject({
      placements: [at(inbox, 5)],
    });
  });

  it('moves a placement, keeps the source on request and never forgets a known uid', async () => {
    const placed = await scene();
    const { messages } = context.repositories;
    const { inbox, allMail, spam } = placed.boxes;
    const id = await gmailMessage(placed);

    await messages.movePlacement(id, { from: inbox.id, to: at(spam, 7), keepSource: false });
    expect((await read(placed, id))?.placements).toEqual(
      sortedPlacements([at(allMail, 40), at(spam, 7)]),
    );
    await expectMirrorParity(context.db, placed.boxes, await read(placed, id));

    await messages.movePlacement(id, { from: allMail.id, to: at(inbox, 0), keepSource: true });
    await messages.movePlacement(id, { from: inbox.id, to: at(spam, 0), keepSource: false });
    expect((await read(placed, id))?.placements).toEqual(
      sortedPlacements([at(allMail, 40), at(spam, 7)]),
    );
    await expectMirrorParity(context.db, placed.boxes, await read(placed, id));

    await messages.movePlacement(newId('message'), {
      from: inbox.id,
      to: at(spam, 9),
      keepSource: false,
    });
    await expect(placementRows(context.db, placed.seeded.account.id)).resolves.toHaveLength(2);
  });
});
