import type { LabelId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import type { FakeMailServer, FakeMailServerOptions } from '../support/mail/fake-mail-server';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const syncedThread = async (engine: TestEngine, serverOptions: FakeMailServerOptions = {}) => {
  const seeded = await seedAccount(engine, {}, serverOptions);
  deliverMail(seeded.server, 'INBOX', { id: 'm1', date: '2026-11-14T08:00:00.000Z' });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  return { ...seeded, thread: present(page.items[0]) };
};

const remoteUids = (server: FakeMailServer, path: string): number[] => [
  ...server.mailbox(path).messages.keys(),
];

const pendingOps = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'provider-op');

describe('mirroring thread actions that the provider rejected', () => {
  it('retries a failed read-state mirror on the next sync', async () => {
    const engine = createTestEngine();
    const { server, thread, account } = await syncedThread(engine);
    server.failConnect = 'Connection refused';

    const read = await engine.services.actions.apply(USER_ID, thread.id, { type: 'markRead' });

    expect(read.unread).toBe(false);
    expect(pendingOps(engine)).toHaveLength(1);
    server.failConnect = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.record('INBOX', 1).flags.seen).toBe(true);
    expect(pendingOps(engine)).toEqual([]);
    const refreshed = await engine.repositories.threads.findById(USER_ID, thread.id);
    expect(refreshed?.unread).toBe(false);
  });

  it('retries a failed label mirror on the next sync', async () => {
    const engine = createTestEngine();
    const { server, thread, account } = await syncedThread(engine);
    const label = await engine.repositories.labels.upsert({
      id: 'lbl_work' as LabelId,
      accountId: account.id,
      name: 'Work',
      color: null,
    });
    server.failOperations = 'Server busy';

    await engine.services.actions.apply(USER_ID, thread.id, {
      type: 'addLabel',
      labelId: label.id,
    });

    server.failOperations = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(server.record('INBOX', 1).keywords).toEqual(['Work']);
    expect(pendingOps(engine)).toEqual([]);
  });

  it('applies an undone that followed a done without UIDPLUS once the uid is known', async () => {
    const engine = createTestEngine();
    const { server, thread, account } = await syncedThread(engine, { uidplus: false });

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'undone' });

    expect(remoteUids(server, 'INBOX')).toEqual([]);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(remoteUids(server, 'Archive')).toEqual([]);
    expect(remoteUids(server, 'INBOX')).toHaveLength(1);
    expect(pendingOps(engine)).toEqual([]);
    await engine.services.sync.syncAccount(USER_ID, account.id);
    const inbox = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
    expect(inbox.items.map((item) => item.id)).toEqual([thread.id]);
  });

  it('lets a later restore cancel a trash move that never reached the provider', async () => {
    const engine = createTestEngine();
    const { server, thread, account } = await syncedThread(engine);
    server.failConnect = 'Connection refused';

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'trash' });
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'restore' });

    server.failConnect = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);
    expect(remoteUids(server, 'INBOX')).toEqual([1]);
    expect(remoteUids(server, 'Trash')).toEqual([]);
    expect(pendingOps(engine)).toEqual([]);
    const current = await engine.repositories.threads.findById(USER_ID, thread.id);
    expect(current?.state).toBe('inbox');
  });

  it('keeps the copies of a move whose source could not be removed and never copies again', async () => {
    const engine = createTestEngine();
    const { server, thread, account } = await syncedThread(engine);
    server.partialMoves = true;

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'done' });
    server.partialMoves = false;
    await engine.services.sync.syncAccount(USER_ID, account.id);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(remoteUids(server, 'Archive')).toHaveLength(1);
    expect(pendingOps(engine)).toEqual([]);
    const [message] = await engine.repositories.messages.listByThread(USER_ID, thread.id);
    const archive = present(await engine.repositories.mailboxes.findByRole(account.id, 'archive'));
    expect(message).toMatchObject({ mailboxId: archive.id, uid: remoteUids(server, 'Archive')[0] });
    expect(engine.db.tables.messages.size).toBe(1);
  });
});
