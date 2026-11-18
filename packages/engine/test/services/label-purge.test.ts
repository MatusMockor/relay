import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { deliverMail, present, seedAccount } from '../support/fixtures';
import { createTestEngine, type TestEngine, TEST_NOW, USER_ID } from '../support/test-engine';

const DATE = '2026-11-14T08:00:00.000Z';
const LATER = '2026-11-15T10:05:00.000Z';

const syncedThread = async (engine: TestEngine, keywords: readonly string[]) => {
  const seeded = await seedAccount(engine);
  deliverMail(seeded.server, 'INBOX', { id: 'k1', date: DATE, keywords });
  deliverMail(seeded.server, 'Archive', { id: 'k2', inReplyTo: 'k1', date: DATE, keywords });
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  const page = await engine.services.inbox.list(USER_ID, { view: 'inbox', limit: 50 });
  engine.events.clear();
  return { ...seeded, thread: present(page.items[0]) };
};

const labelNames = async (engine: TestEngine, accountId: AccountId) =>
  (await engine.repositories.labels.list(USER_ID, accountId)).map(({ name }) => name);

const labelNamed = async (engine: TestEngine, accountId: AccountId, name: string) =>
  present(
    (await engine.repositories.labels.list(USER_ID, accountId)).find(
      (label) => label.name === name,
    ),
  );

const purges = (engine: TestEngine, accountId: AccountId) =>
  engine.repositories.pendingWork.list(accountId, 'keyword-purge');

describe('deleting a keyword label', () => {
  it('refreshes its threads and purges the exact keyword from every synced mailbox', async () => {
    const engine = createTestEngine();
    const { account, server, thread } = await syncedThread(engine, ['Clients', 'kept']);
    const label = await labelNamed(engine, account.id, 'Clients');

    await engine.services.labelAdmin.remove(USER_ID, label.id);

    expect(server.keywordPurges.map(({ path }) => path).sort()).toEqual([
      'Archive',
      'INBOX',
      'Sent',
      'Trash',
    ]);
    expect(server.keywordPurges.every(({ keyword }) => keyword === 'Clients')).toBe(true);
    expect(server.record('INBOX', 1).keywords).toEqual(['kept']);
    expect(server.record('Archive', 1).keywords).toEqual(['kept']);
    const upserted = engine.events.ofType('thread.upserted').map((event) => event.data.thread);
    expect(upserted.map((item) => item.id)).toEqual([thread.id]);
    expect(upserted[0]?.labelIds).not.toContain(label.id);
    expect(await labelNames(engine, account.id)).toEqual(['kept']);
  });

  it('suppresses the keyword until a sync that started after the purge completes', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = await labelNamed(engine, account.id, 'clients');
    await engine.services.labelAdmin.remove(USER_ID, label.id);
    expect((await purges(engine, account.id)).map((work) => work.payload)).toEqual([
      expect.objectContaining({ keyword: 'clients', purgedAt: TEST_NOW }),
    ]);
    server.updateKeywords('INBOX', 1, ['CLIENTS']);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await labelNames(engine, account.id)).toEqual([]);
    expect(await purges(engine, account.id)).toHaveLength(1);

    engine.clock.set(LATER);
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await purges(engine, account.id)).toEqual([]);
  });

  it('keeps the purge queued while offline and runs it on the next sync', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = await labelNamed(engine, account.id, 'clients');
    server.failOperations = 'connection reset';

    await engine.services.labelAdmin.remove(USER_ID, label.id);

    expect(await labelNames(engine, account.id)).toEqual([]);
    expect((await purges(engine, account.id)).map((work) => work.payload.purgedAt)).toEqual([
      undefined,
    ]);

    server.failOperations = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.record('INBOX', 1).keywords).toEqual([]);
    expect(await labelNames(engine, account.id)).toEqual([]);
  });

  it('does not bring the label back from keywords still waiting to be purged', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = await labelNamed(engine, account.id, 'clients');
    server.failKeywordPurge = 'STORE rejected';
    await engine.services.labelAdmin.remove(USER_ID, label.id);
    server.updateKeywords('INBOX', 1, ['clients', 'fresh']);

    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(await labelNames(engine, account.id)).toEqual(['fresh']);
    expect((await purges(engine, account.id)).map((work) => work.payload.purgedAt)).toEqual([
      undefined,
    ]);

    server.failKeywordPurge = null;
    await engine.services.sync.syncAccount(USER_ID, account.id);

    expect(server.record('INBOX', 1).keywords).toEqual(['fresh']);
  });

  it('cancels a queued purge when a label with the same keyword is created again', async () => {
    const engine = createTestEngine();
    const { account, server } = await syncedThread(engine, ['clients']);
    const label = await labelNamed(engine, account.id, 'clients');
    server.failOperations = 'connection reset';
    await engine.services.labelAdmin.remove(USER_ID, label.id);

    await engine.services.labelAdmin.create(USER_ID, { accountId: account.id, name: 'Clients' });

    expect(await purges(engine, account.id)).toEqual([]);
  });
});
