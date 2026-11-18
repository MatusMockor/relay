import { ConflictError } from '@relay/engine';
import type { Label } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { at, buildMessage, buildThread, newId, seedAccount, seedThread } from './support/fixtures';
import { openLockHolder, waitForLockWaiters } from './support/lock-holder';
import { usePgTestContext } from './support/pg-test-context';

describe('PgLabelRepository', () => {
  const context = usePgTestContext();

  it('upserts, lists, finds and deletes labels per user', async () => {
    const seeded = await seedAccount(context.repositories);
    const second = await seedAccount(context.repositories, seeded.user);
    const work: Label = {
      id: newId('label'),
      accountId: seeded.account.id,
      name: 'Práca',
      color: '#ff0000',
      kind: 'keyword',
      remoteName: 'Práca',
    };
    const home: Label = {
      id: newId('label'),
      accountId: second.account.id,
      name: 'Domov',
      color: null,
      kind: 'keyword',
      remoteName: 'Domov',
    };
    await context.repositories.labels.upsert(work);
    await context.repositories.labels.upsert(home);
    await context.repositories.labels.upsert({ ...work, color: '#00ff00' });

    await expect(context.repositories.labels.list(seeded.user.id, null)).resolves.toEqual([
      home,
      { ...work, color: '#00ff00' },
    ]);
    await expect(
      context.repositories.labels.list(seeded.user.id, second.account.id),
    ).resolves.toEqual([home]);
    await expect(
      context.repositories.labels.findByName(seeded.account.id, 'Práca'),
    ).resolves.toMatchObject({ id: work.id });

    const stranger = await seedAccount(context.repositories);
    await expect(
      context.repositories.labels.findById(stranger.user.id, work.id),
    ).resolves.toBeNull();
    await expect(
      context.repositories.labels.upsert({ ...work, accountId: stranger.account.id }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(context.repositories.labels.delete(stranger.user.id, work.id)).resolves.toBe(
      false,
    );
    await expect(context.repositories.labels.delete(seeded.user.id, work.id)).resolves.toBe(true);
  });
});

describe('PgMessageRepository', () => {
  const context = usePgTestContext();

  it('round-trips a message with labels and finds it by every key', async () => {
    const seeded = await seedAccount(context.repositories);
    const label: Label = {
      id: newId('label'),
      accountId: seeded.account.id,
      name: 'VIP',
      color: null,
      kind: 'keyword',
      remoteName: 'VIP',
    };
    await context.repositories.labels.upsert(label);
    const thread = buildThread(seeded.account.id);
    const message = buildMessage(thread, seeded.mailboxes.inbox, {
      uid: 7,
      references: ['<a@x>', '<b@x>'],
      labelIds: [label.id],
      cc: [{ name: 'Šéf', email: 'sef@firma.sk' }],
      attachments: [
        {
          id: newId('attachment'),
          filename: 'faktúra.pdf',
          contentType: 'application/pdf',
          size: 1200,
          contentId: null,
          inline: false,
        },
      ],
    });

    const stored = await context.repositories.messages.upsert(
      message,
      new Map([['x-test', ['1']]]),
    );
    expect(stored).toEqual(message);
    await expect(
      context.repositories.messages.findById(seeded.user.id, message.id),
    ).resolves.toEqual(message);
    await expect(
      context.repositories.messages.findByLocation({
        mailboxId: seeded.mailboxes.inbox.id,
        uid: 7,
      }),
    ).resolves.toEqual(message);
    await expect(
      context.repositories.messages.findByMessageIdHeaders(seeded.account.id, [
        message.messageIdHeader ?? '',
      ]),
    ).resolves.toEqual([message]);
    await expect(
      context.repositories.messages.listByThread(seeded.user.id, thread.id),
    ).resolves.toEqual([message]);

    const stranger = await seedAccount(context.repositories);
    await expect(
      context.repositories.messages.findById(stranger.user.id, message.id),
    ).resolves.toBeNull();
    await expect(
      context.repositories.messages.listByThread(stranger.user.id, thread.id),
    ).resolves.toEqual([]);
  });

  it('updates flags, labels and location, and drops labels of other accounts', async () => {
    const seeded = await seedAccount(context.repositories);
    const other = await seedAccount(context.repositories, seeded.user);
    const own: Label = {
      id: newId('label'),
      accountId: seeded.account.id,
      name: 'A',
      color: null,
      kind: 'keyword',
      remoteName: 'A',
    };
    const foreign: Label = {
      id: newId('label'),
      accountId: other.account.id,
      name: 'B',
      color: null,
      kind: 'keyword',
      remoteName: 'B',
    };
    await context.repositories.labels.upsert(own);
    await context.repositories.labels.upsert(foreign);
    const { message } = await seedThread(context.repositories, seeded);

    await context.repositories.messages.updateFlags(message.id, {
      seen: true,
      flagged: true,
      answered: false,
    });
    await context.repositories.messages.updateLabels(message.id, [own.id, foreign.id]);
    await context.repositories.messages.move(message.id, {
      mailboxId: seeded.mailboxes.sent.id,
      uid: 99,
    });

    await expect(
      context.repositories.messages.findById(seeded.user.id, message.id),
    ).resolves.toEqual({
      ...message,
      flags: { seen: true, flagged: true, answered: false },
      labelIds: [own.id],
      mailboxId: seeded.mailboxes.sent.id,
      uid: 99,
    });
  });

  it('replaces labels as a whole when another replacement holds the message', async () => {
    const seeded = await seedAccount(context.repositories);
    const label = (name: string): Label => ({
      id: newId('label'),
      accountId: seeded.account.id,
      name,
      color: null,
      kind: 'keyword',
      remoteName: name,
    });
    const first = label('Prvý');
    const second = label('Druhý');
    await context.repositories.labels.upsert(first);
    await context.repositories.labels.upsert(second);
    const { message } = await seedThread(context.repositories, seeded);
    const holder = await openLockHolder(context.url);
    await holder.query('SELECT 1 FROM messages WHERE id = $1 FOR UPDATE', [message.id]);
    await holder.query(
      'INSERT INTO message_labels (message_id, label_id, user_id) VALUES ($1, $2, $3)',
      [message.id, first.id, seeded.user.id],
    );

    const replacing = context.repositories.messages.updateLabels(message.id, [second.id]);
    await waitForLockWaiters(context.url);
    await holder.commit();
    await replacing;

    await expect(
      context.repositories.messages.findById(seeded.user.id, message.id),
    ).resolves.toMatchObject({ labelIds: [second.id] });
  });

  it('lists uids and deletes by uid returning affected threads', async () => {
    const seeded = await seedAccount(context.repositories);
    const first = await seedThread(context.repositories, seeded, {}, { uid: 3 });
    await seedThread(context.repositories, seeded, {}, { uid: 1 });
    const extra = buildMessage(first.thread, seeded.mailboxes.inbox, { uid: 2 });
    await context.repositories.messages.upsert(extra, new Map());

    await expect(
      context.repositories.messages.listUids(seeded.mailboxes.inbox.id),
    ).resolves.toEqual([1, 2, 3]);
    await expect(
      context.repositories.messages.deleteByUids(seeded.mailboxes.inbox.id, [2, 3, 404]),
    ).resolves.toEqual([first.thread.id]);
    await expect(
      context.repositories.messages.listUids(seeded.mailboxes.inbox.id),
    ).resolves.toEqual([1]);
  });

  it('pages through split match subjects with headers', async () => {
    const seeded = await seedAccount(context.repositories);
    for (const minute of [1, 2, 3]) {
      const thread = buildThread(seeded.account.id, { lastMessageAt: at(minute) });
      await context.repositories.messages.upsert(
        buildMessage(thread, seeded.mailboxes.inbox, { subject: `S${String(minute)}` }),
        new Map([['list-id', [`list-${String(minute)}`]]]),
      );
    }
    const first = await context.repositories.messages.listMatchSubjects(seeded.account.id, {
      cursor: null,
      limit: 2,
    });
    const second = await context.repositories.messages.listMatchSubjects(seeded.account.id, {
      cursor: first.nextCursor,
      limit: 2,
    });

    expect(first.items.map((item) => item.subject.subject)).toEqual(['S1', 'S2']);
    expect(first.items[0]?.subject.headers.get('list-id')).toEqual(['list-1']);
    expect(second.items.map((item) => item.subject.subject)).toEqual(['S3']);
    expect(second.nextCursor).toBeNull();
  });

  it('adds and removes single labels without overwriting concurrent additions', async () => {
    const seeded = await seedAccount(context.repositories);
    const other = await seedAccount(context.repositories);
    const label = (accountId: typeof seeded.account.id, name: string): Label => ({
      id: newId('label'),
      accountId,
      name,
      color: null,
      kind: 'keyword',
      remoteName: name,
    });
    const first = label(seeded.account.id, 'Prvý');
    const second = label(seeded.account.id, 'Druhý');
    const foreign = label(other.account.id, 'Cudzí');
    for (const item of [first, second, foreign]) {
      await context.repositories.labels.upsert(item);
    }
    const { message } = await seedThread(context.repositories, seeded);
    const { messages } = context.repositories;

    await Promise.all([
      messages.addLabel(message.id, first.id),
      messages.addLabel(message.id, second.id),
      messages.addLabel(message.id, second.id),
      messages.addLabel(message.id, foreign.id),
    ]);
    const added = await messages.findById(seeded.user.id, message.id);
    expect([...(added?.labelIds ?? [])].sort()).toEqual([first.id, second.id].sort());
    await messages.removeLabel(message.id, first.id);
    await expect(messages.findById(seeded.user.id, message.id)).resolves.toMatchObject({
      labelIds: [second.id],
    });
  });
});
