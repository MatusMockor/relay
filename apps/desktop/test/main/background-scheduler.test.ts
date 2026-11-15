import { type AccountId, AccountIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  AccountSyncScheduler,
  type SyncableAccount,
} from '../../src/main/background/account-sync-scheduler';
import { DueWorkTicker } from '../../src/main/background/due-work-ticker';
import { PowerAwareLifecycle } from '../../src/main/background/power-aware-lifecycle';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';
import { TestPowerEvents } from './support/test-power-events';

const accountA = AccountIdSchema.parse('acc_a');
const accountB = AccountIdSchema.parse('acc_b');

const setup = (initial: SyncableAccount[]) => {
  const time = new ManualTime();
  const syncs: { accountId: AccountId; at: string }[] = [];
  let accounts = initial;
  const scheduler = new AccountSyncScheduler({
    listAccounts: () => Promise.resolve(accounts),
    syncAccount: (accountId) => {
      syncs.push({ accountId, at: time.now().toISOString() });
      return Promise.resolve();
    },
    timers: time,
    logger: createTestLogger().logger,
  });
  return {
    time,
    syncs,
    scheduler,
    setAccounts: (next: SyncableAccount[]) => {
      accounts = next;
    },
    countFor: (accountId: AccountId) => syncs.filter((sync) => sync.accountId === accountId).length,
  };
};

describe('AccountSyncScheduler', () => {
  it('syncs each account right away and then honors its own interval', async () => {
    const { time, scheduler, countFor } = setup([
      { id: accountA, syncIntervalSeconds: 60 },
      { id: accountB, syncIntervalSeconds: 300 },
    ]);
    await scheduler.start();
    await time.advance(0);
    expect(countFor(accountA)).toBe(1);
    expect(countFor(accountB)).toBe(1);
    await time.advance(10 * 60_000);
    expect(countFor(accountA)).toBe(11);
    expect(countFor(accountB)).toBe(3);
    await scheduler.stop();
    await time.advance(10 * 60_000);
    expect(countFor(accountA)).toBe(11);
  });

  it('picks up added, removed and re-timed accounts on reconcile', async () => {
    const { time, scheduler, countFor, setAccounts } = setup([
      { id: accountA, syncIntervalSeconds: 60 },
    ]);
    await scheduler.start();
    await time.advance(0);
    setAccounts([
      { id: accountA, syncIntervalSeconds: 600 },
      { id: accountB, syncIntervalSeconds: 60 },
    ]);
    await scheduler.reconcile();
    await time.advance(5 * 60_000);
    expect(countFor(accountA)).toBe(1);
    expect(countFor(accountB)).toBe(6);
    setAccounts([{ id: accountA, syncIntervalSeconds: 600 }]);
    await scheduler.reconcile();
    await time.advance(5 * 60_000);
    expect(countFor(accountB)).toBe(6);
    expect(countFor(accountA)).toBe(2);
    await scheduler.stop();
  });

  it('runs an on-demand sync immediately and restarts the interval after it', async () => {
    const { time, scheduler, syncs } = setup([{ id: accountA, syncIntervalSeconds: 120 }]);
    await scheduler.start();
    await time.advance(90_000);
    await scheduler.syncNow(accountA);
    await time.advance(119_000);
    await time.advance(1_000);
    expect(syncs.map((sync) => sync.at)).toEqual([
      '2026-11-15T08:00:00.000Z',
      '2026-11-15T08:01:30.000Z',
      '2026-11-15T08:03:30.000Z',
    ]);
    await scheduler.stop();
  });
});

describe('PowerAwareLifecycle', () => {
  it('pauses all background work on suspend and resumes on wake', async () => {
    const { time, scheduler, countFor } = setup([{ id: accountA, syncIntervalSeconds: 60 }]);
    const ticks: string[] = [];
    const ticker = new DueWorkTicker({
      jobs: [
        {
          name: 'reminders',
          run: () => {
            ticks.push(time.now().toISOString());
            return Promise.resolve();
          },
        },
      ],
      intervalMs: 30_000,
      timers: time,
      logger: createTestLogger().logger,
    });
    const power = new TestPowerEvents();
    const lifecycle = new PowerAwareLifecycle(
      [scheduler, ticker],
      power,
      createTestLogger().logger,
    );
    await lifecycle.start();
    await time.advance(60_000);
    expect(countFor(accountA)).toBe(2);
    expect(ticks).toHaveLength(3);

    power.emitSuspend();
    await time.advance(0);
    expect(lifecycle.isRunning).toBe(false);
    await time.advance(60 * 60_000);
    expect(countFor(accountA)).toBe(2);
    expect(ticks).toHaveLength(3);
    expect(time.pendingCount).toBe(0);

    power.emitResume();
    await time.advance(0);
    expect(lifecycle.isRunning).toBe(true);
    expect(countFor(accountA)).toBe(3);
    expect(ticks).toHaveLength(4);
    await lifecycle.shutdown();
    expect(time.pendingCount).toBe(0);
  });
});
