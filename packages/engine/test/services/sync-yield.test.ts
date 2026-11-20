import type { SyncReport } from '../../src';
import { describe, expect, it } from 'vitest';
import { deliverMail, messageHeader, present, seedAccount } from '../support/fixtures';
import { seedHistory, storedMessages } from '../support/history';
import { createTestEngine, TEST_NOW, USER_ID } from '../support/test-engine';

const HISTORY = { sliceMessages: 500, sliceMs: 15_000, batch: 100, sliceSearches: 64 };

const syncedArchive = async () => {
  const engine = createTestEngine({ sync: { history: HISTORY } });
  const seeded = await seedAccount(engine);
  seedHistory(seeded.server, 'Archive', 900);
  await engine.services.sync.syncAccount(USER_ID, seeded.account.id);
  return { engine, seeded };
};

describe('history backfill and sync priority', () => {
  it('yields to a sync requested mid-slice after the current batch', async () => {
    const { engine, seeded } = await syncedArchive();
    const before = storedMessages(engine).length;
    const requested: { sync: Promise<SyncReport> | null } = { sync: null };
    seeded.server.beforeNextFetch = () => {
      deliverMail(seeded.server, 'INBOX', { id: 'fresh', date: TEST_NOW });
      requested.sync = engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    };

    const report = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(report).toMatchObject({ skipped: false, processed: 100, more: true });
    const sync = await present(requested.sync);
    expect(sync).toMatchObject({ ok: true, newMessages: 1 });
    expect(storedMessages(engine)).toHaveLength(before + 101);
    const fresh = present(
      storedMessages(engine).find((message) => message.messageIdHeader === messageHeader('fresh')),
    );
    expect(fresh.bodyState).toBeUndefined();
  });

  it('skips a slice while a sync is running or queued for the account', async () => {
    const { engine, seeded } = await syncedArchive();
    const running = engine.services.sync.syncAccount(USER_ID, seeded.account.id);
    const queued = engine.services.sync.syncAccount(USER_ID, seeded.account.id);

    const whileRunning = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);
    await running;
    const whileQueued = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);
    await queued;
    const afterwards = await engine.services.sync.backfillHistory(USER_ID, seeded.account.id);

    expect(whileRunning).toEqual({ skipped: true, reason: 'busy' });
    expect(whileQueued).toEqual({ skipped: true, reason: 'busy' });
    expect(afterwards).toMatchObject({ skipped: false, processed: 500 });
  });

  it('starts only one slice at a time per account', async () => {
    const { engine, seeded } = await syncedArchive();

    const [first, second] = await Promise.all([
      engine.services.sync.backfillHistory(USER_ID, seeded.account.id),
      engine.services.sync.backfillHistory(USER_ID, seeded.account.id),
    ]);

    expect(first).toMatchObject({ skipped: false, processed: 500 });
    expect(second).toEqual({ skipped: true, reason: 'busy' });
  });
});
