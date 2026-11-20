import type { LabelId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';
import type { FakeMailServer, FakeMailServerOptions } from '../support/mail/fake-mail-server';

const syncedThread = async (engine: TestEngine, serverOptions: FakeMailServerOptions = {}) => {
  const seeded = await seedAccount(engine, {}, serverOptions);
  deliverMail(seeded.server, 'INBOX', { id: 'm1', date: '2026-11-14T08:00:00.000Z' });
  deliverMail(seeded.server, 'INBOX', {
    id: 'm2',
    inReplyTo: 'm1',
    date: '2026-11-14T09:00:00.000Z',
  });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  engine.events.clear();
  return { ...seeded, thread: present(page.items[0]) };
};

const remoteUids = (server: FakeMailServer, path: string): number[] => [
  ...server.mailbox(path).messages.keys(),
];

describe('MessageActionsService', () => {
  it('archives on done and restores on undone, mirrored to the provider', async () => {
    const engine = createTestEngine();
    const { server, thread, account } = await syncedThread(engine);

    const done = await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });

    expect(done).toMatchObject({ state: 'done', markedDone: true });
    const completed = await engine.services.inbox.list(USER_ID, { view: 'done', limit: 50 });
    expect(completed.items.map((item) => item.id)).toEqual([thread.id]);
    expect(remoteUids(server, 'INBOX')).toEqual([]);
    expect(remoteUids(server, 'Archive')).toEqual([1, 2]);
    const archive = present(await engine.repositories.mailboxes.findByRole(account.id, 'archive'));
    const messages = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(messages.map((message) => [message.mailboxId, message.uid])).toEqual([
      [archive.id, 1],
      [archive.id, 2],
    ]);
    expect(engine.events.ofType('thread.upserted').at(-1)?.data.thread.state).toBe('done');

    const undone = await engine.services.actions.apply(USER_ID, thread.id, { type: 'undone' });

    expect(undone).toMatchObject({ state: 'inbox', markedDone: false });
    expect(remoteUids(server, 'INBOX')).toEqual([3, 4]);
    expect(remoteUids(server, 'Archive')).toEqual([]);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(engine.db.tables.messages.size).toBe(2);
  });

  it('adopts the real uid on the next sync when the server has no UIDPLUS', async () => {
    const engine = createTestEngine();
    const { thread, account } = await syncedThread(engine, { uidplus: false });

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });
    const pending = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(pending.map((message) => message.uid)).toEqual([0, 0]);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    const adopted = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(adopted.map((message) => message.uid).sort()).toEqual([1, 2]);
    expect(engine.db.tables.messages.size).toBe(2);
    const reloaded = await engine.repositories.threads.findById(USER_ID, thread.id);
    expect(reloaded?.state).toBe('done');
  });

  it('trashes and restores threads', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine);

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    expect(remoteUids(server, 'Trash')).toHaveLength(2);
    const trash = await engine.services.inbox.list(USER_ID, { view: 'trash', limit: 50 });
    expect(trash.items.map((item) => item.id)).toEqual([thread.id]);

    const restored = await engine.services.actions.apply(USER_ID, thread.id, { type: 'restore' });
    expect(restored.state).toBe('inbox');
    expect(remoteUids(server, 'INBOX')).toHaveLength(2);
  });

  it('marks read and unread locally and on the server', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine);

    const read = await engine.services.actions.apply(USER_ID, thread.id, { type: 'markRead' });
    expect(read.unread).toBe(false);
    expect(server.record('INBOX', 1).flags.seen).toBe(true);
    expect(server.record('INBOX', 2).flags.seen).toBe(true);

    const unread = await engine.services.actions.apply(USER_ID, thread.id, { type: 'markUnread' });
    expect(unread.unread).toBe(true);
    expect(server.record('INBOX', 1).flags.seen).toBe(true);
    expect(server.record('INBOX', 2).flags.seen).toBe(false);
  });

  it('marks a thread read when its detail is opened with markRead', async () => {
    const engine = createTestEngine();
    const { thread } = await syncedThread(engine);

    const detail = await engine.services.threads.getDetail(USER_ID, thread.id, { markRead: true });

    expect(detail.thread.unread).toBe(false);
    expect(detail.messages.map((message) => message.messageIdHeader)).toEqual([
      '<m1@mail.test>',
      '<m2@mail.test>',
    ]);
    expect(detail.messages.every((message) => message.flags.seen)).toBe(true);
    const peek = await engine.services.threads.getDetail(USER_ID, thread.id);
    expect(peek.thread.unread).toBe(false);
  });

  it('adds and removes labels as IMAP keywords', async () => {
    const engine = createTestEngine();
    const { server, thread, account } = await syncedThread(engine);
    const label = await engine.repositories.labels.upsert({
      id: 'label_clients' as LabelId,
      accountId: account.id,
      name: 'Clients',
      color: null,
      kind: 'keyword',
      remoteName: 'Clients',
    });

    const labelled = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'addLabel',
      labelId: label.id,
    });
    expect(labelled.labelIds).toEqual([label.id]);
    expect(server.record('INBOX', 1).keywords).toEqual(['Clients']);

    const cleared = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'removeLabel',
      labelId: label.id,
    });
    expect(cleared.labelIds).toEqual([]);
    expect(server.record('INBOX', 2).keywords).toEqual([]);
  });

  it('keeps both labels added to a thread at the same time', async () => {
    const engine = createTestEngine();
    const { thread, account } = await syncedThread(engine);
    const clients = await engine.repositories.labels.upsert({
      id: 'label_clients' as LabelId,
      accountId: account.id,
      name: 'Clients',
      color: null,
      kind: 'keyword',
      remoteName: 'Clients',
    });
    const urgent = await engine.repositories.labels.upsert({
      id: 'label_urgent' as LabelId,
      accountId: account.id,
      name: 'Urgent',
      color: null,
      kind: 'keyword',
      remoteName: 'Urgent',
    });

    await Promise.all([
      engine.services.actions.apply(USER_ID, thread.id, { type: 'addLabel', labelId: clients.id }),
      engine.services.actions.apply(USER_ID, thread.id, { type: 'addLabel', labelId: urgent.id }),
    ]);

    const messages = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(messages.map((message) => [...message.labelIds].sort())).toEqual([
      [clients.id, urgent.id],
      [clients.id, urgent.id],
    ]);
  });

  it('keeps the local change when the provider is unreachable', async () => {
    const engine = createTestEngine();
    const { server, thread, account } = await syncedThread(engine);
    server.failOperations = 'connection reset';

    const done = await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });

    expect(done.state).toBe('done');
    const inbox = present(await engine.repositories.mailboxes.findByRole(account.id, 'inbox'));
    const messages = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    expect(messages.every((message) => message.mailboxId === inbox.id)).toBe(true);
    expect(engine.logger.entries.some((entry) => entry.level === 'warn')).toBe(true);
  });

  it('rejects threads of other users and labels of other accounts', async () => {
    const engine = createTestEngine();
    const { thread } = await syncedThread(engine);
    const other = await seedAccount(engine, { email: 'second@example.com' });
    await engine.repositories.labels.upsert({
      id: 'label_other' as LabelId,
      accountId: other.account.id,
      name: 'Other',
      color: null,
      kind: 'keyword',
      remoteName: 'Other',
    });

    await expect(
      engine.services.actions.apply('user_bob' as typeof USER_ID, thread.id, { type: 'done' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    await expect(
      engine.services.actions.apply(USER_ID, thread.id, {
        type: 'addLabel',
        labelId: 'label_other' as LabelId,
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});
