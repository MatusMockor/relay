import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount, type SeededAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, USER_ID } from '../support/test-engine';

const syncedAccount = async (engine: TestEngine, condstore = false): Promise<SeededAccount> => {
  const seeded = await seedAccount(engine, {}, { condstore });
  deliverMail(seeded.server, 'INBOX', { id: 'm1' });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  return seeded;
};

const onlyThread = async (engine: TestEngine) =>
  present((await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 })).items[0]);

const pendingOps = (engine: TestEngine) =>
  [...engine.db.tables.pendingWork.values()].filter((work) => work.kind === 'provider-op');

describe('sync with pending flag writes', () => {
  it('keeps a thread read while its \\Seen store keeps failing', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedAccount(engine);
    server.failFlagWrites = 'STORE rejected';

    await engine.services.actions.apply(USER_ID, (await onlyThread(engine)).id, {
      type: 'markRead',
    });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect((await onlyThread(engine)).unread).toBe(false);
    expect(server.record('INBOX', 1).flags.seen).toBe(false);
    expect(pendingOps(engine)).toHaveLength(1);
  });

  it('keeps a thread unread while removing \\Seen keeps failing', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedAccount(engine);
    const thread = await onlyThread(engine);
    await engine.services.actions.apply(USER_ID, thread.id, { type: 'markRead' });
    server.failFlagWrites = 'STORE rejected';

    await engine.services.actions.apply(USER_ID, thread.id, { type: 'markUnread' });
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect((await onlyThread(engine)).unread).toBe(true);
    expect(server.record('INBOX', 1).flags.seen).toBe(true);
  });

  it('keeps pending seen when a message is fetched again', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedAccount(engine, true);
    server.failFlagWrites = 'STORE rejected';
    await engine.services.actions.apply(USER_ID, (await onlyThread(engine)).id, {
      type: 'markRead',
    });
    const inbox = present(await engine.repositories.mailboxes.findByPath(account.id, 'INBOX'));
    const state = present(await engine.repositories.syncStates.find(inbox.id));
    await engine.repositories.syncStates.save({ ...state, lastUid: 0, uidNext: 1 });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.streamedMessages).toContainEqual({ path: 'INBOX', uid: 1 });
    expect((await onlyThread(engine)).unread).toBe(false);
    expect(pendingOps(engine)).toHaveLength(1);
  });

  it('applies remote flags once nothing is pending', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedAccount(engine);
    server.updateFlags('INBOX', 1, { seen: true });

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect((await onlyThread(engine)).unread).toBe(false);
  });
});
