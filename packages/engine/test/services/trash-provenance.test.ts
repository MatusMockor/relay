import type { Address, ThreadId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, type MailSpec, ME, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const ALIAS: Address = { name: 'Alice', email: 'alice@alias.test' };

const remoteUids = (server: FakeMailServer, path: string): number[] => [
  ...server.mailbox(path).messages.keys(),
];

const syncedThread = async (engine: TestEngine, deliveries: readonly [string, MailSpec][]) => {
  const seeded = await seedAccount(engine);
  deliveries.forEach(([path, spec]) => deliverMail(seeded.server, path, spec));
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const [thread] = [...engine.db.tables.threads.values()];
  return { ...seeded, thread: present(thread) };
};

const trashAndRestore = async (engine: TestEngine, threadId: ThreadId) => {
  await engine.services.actions.apply(USER_ID, threadId, { type: 'trash' });
  return engine.services.actions.apply(USER_ID, threadId, { type: 'restore' });
};

const DATE = '2026-11-14T08:00:00.000Z';

describe('trash provenance of local trash and restore', () => {
  it('trashes the same messages when trash is repeated before it reaches the server', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine, [
      ['INBOX', { id: 'm1', date: DATE }],
      ['Sent', { id: 'r1', from: ME, inReplyTo: 'm1', references: ['m1'], date: DATE }],
    ]);
    server.failConnect = 'Connection refused';

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    server.failConnect = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(remoteUids(server, 'INBOX')).toEqual([]);
    expect(remoteUids(server, 'Trash')).toHaveLength(1);
    expect(remoteUids(server, 'Sent')).toHaveLength(1);
  });

  it('restores self-addressed inbox mail to the inbox', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine, [
      ['INBOX', { id: 'n1', from: ME, to: [ME], date: DATE }],
    ]);

    const restored = await trashAndRestore(engine, thread.id);

    expect(restored.state).toBe('inbox');
    expect(remoteUids(server, 'INBOX')).toHaveLength(1);
    expect(remoteUids(server, 'Sent')).toEqual([]);
  });

  it('restores mail sent from an alias back to the sent mailbox', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine, [
      ['Sent', { id: 's1', from: ALIAS, date: DATE }],
    ]);

    const restored = await trashAndRestore(engine, thread.id);

    expect(restored.state).toBe('done');
    expect(remoteUids(server, 'Sent')).toHaveLength(1);
    expect(remoteUids(server, 'INBOX')).toEqual([]);
    expect(remoteUids(server, 'Trash')).toEqual([]);
  });

  it('restores an archived thread to the archive', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine, [['Archive', { id: 'a1', date: DATE }]]);

    const restored = await trashAndRestore(engine, thread.id);

    expect(restored.state).toBe('done');
    expect(remoteUids(server, 'Archive')).toHaveLength(1);
    expect(remoteUids(server, 'INBOX')).toEqual([]);
  });

  it('restores mail trashed outside Relay to the inbox', async () => {
    const engine = createTestEngine();
    const { server, thread } = await syncedThread(engine, [
      ['Trash', { id: 't1', from: ME, date: DATE }],
    ]);
    expect(thread.state).toBe('trash');

    const restored = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'restore',
    });

    expect(restored.state).toBe('inbox');
    expect(remoteUids(server, 'INBOX')).toHaveLength(1);
    expect(remoteUids(server, 'Trash')).toEqual([]);
  });

  it('restores to the inbox when another message of the thread is still in INBOX', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine, [
      ['Archive', { id: 'a1', date: DATE }],
    ]);
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    deliverMail(server, 'INBOX', { id: 'a2', inReplyTo: 'a1', references: ['a1'], date: DATE });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    const restored = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'restore',
    });

    expect(restored.state).toBe('inbox');
    expect(remoteUids(server, 'Archive')).toHaveLength(1);
    expect(remoteUids(server, 'INBOX')).toHaveLength(1);
  });

  it('files a restored thread with nothing in trash by where its mail is', async () => {
    const engine = createTestEngine();
    const { thread } = await syncedThread(engine, [['Sent', { id: 's1', from: ME, date: DATE }]]);

    const restored = await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'restore',
    });

    expect(restored.state).toBe('done');
  });

  it('forgets the provenance once a thread is restored', async () => {
    const engine = createTestEngine();
    const { thread } = await syncedThread(engine, [['INBOX', { id: 'm1', date: DATE }]]);

    await trashAndRestore(engine, thread.id);

    const origins = [...engine.db.tables.pendingWork.values()].filter(
      (work) => work.kind === 'trash-origin',
    );
    expect(origins).toEqual([]);
  });
});
