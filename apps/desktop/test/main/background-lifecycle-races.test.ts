import { type AccountId, AccountIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  AccountSyncScheduler,
  type SyncableAccount,
} from '../../src/main/background/account-sync-scheduler';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';

const accountA = AccountIdSchema.parse('acc_a');

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('background lifecycle races', () => {
  it('waits for an in-flight sync before stop resolves', async () => {
    const time = new ManualTime();
    const sync = deferred<undefined>();
    const scheduler = new AccountSyncScheduler({
      listAccounts: () => Promise.resolve([{ id: accountA, syncIntervalSeconds: 60 }]),
      syncAccount: () => sync.promise,
      timers: time,
      logger: createTestLogger().logger,
    });
    await scheduler.start();
    await time.advance(0);
    let stopped = false;
    const stopping = scheduler.stop().then(() => {
      stopped = true;
    });
    await time.advance(0);
    expect(stopped).toBe(false);
    sync.resolve(undefined);
    await stopping;
    expect(stopped).toBe(true);
    expect(time.pendingCount).toBe(0);
  });

  const pendingSyncScheduler = (initial: SyncableAccount[]) => {
    const time = new ManualTime();
    const sync = deferred<undefined>();
    let accounts = initial;
    const scheduler = new AccountSyncScheduler({
      listAccounts: () => Promise.resolve(accounts),
      syncAccount: () => sync.promise,
      timers: time,
      logger: createTestLogger().logger,
    });
    const stopTracked = () => {
      const state = { stopped: false };
      const stopping = scheduler.stop().then(() => {
        state.stopped = true;
      });
      return { state, stopping };
    };
    return {
      time,
      sync,
      scheduler,
      stopTracked,
      setAccounts: (next: SyncableAccount[]) => {
        accounts = next;
      },
    };
  };

  it('waits on stop for a sync of an account that reconcile removed meanwhile', async () => {
    const { time, sync, scheduler, stopTracked, setAccounts } = pendingSyncScheduler([
      { id: accountA, syncIntervalSeconds: 60 },
    ]);
    await scheduler.start();
    await time.advance(0);
    setAccounts([]);
    await scheduler.reconcile();

    const { state, stopping } = stopTracked();
    await time.advance(0);
    expect(state.stopped).toBe(false);
    sync.resolve(undefined);
    await stopping;
    expect(state.stopped).toBe(true);
  });

  it('waits on stop for an on-demand sync of an account without a scheduled runner', async () => {
    const { time, sync, scheduler, stopTracked } = pendingSyncScheduler([]);
    await scheduler.start();
    const manual = scheduler.syncNow(accountA);
    await time.advance(0);

    const { state, stopping } = stopTracked();
    await time.advance(0);
    expect(state.stopped).toBe(false);
    sync.resolve(undefined);
    await Promise.all([manual, stopping]);
    expect(state.stopped).toBe(true);
  });

  it('does not start syncing when stop happens while accounts are still loading', async () => {
    const time = new ManualTime();
    const accounts = deferred<SyncableAccount[]>();
    const synced: AccountId[] = [];
    const scheduler = new AccountSyncScheduler({
      listAccounts: () => accounts.promise,
      syncAccount: (accountId) => {
        synced.push(accountId);
        return Promise.resolve();
      },
      timers: time,
      logger: createTestLogger().logger,
    });
    const starting = scheduler.start();
    await scheduler.stop();
    accounts.resolve([{ id: accountA, syncIntervalSeconds: 60 }]);
    await starting;
    await time.advance(10 * 60_000);
    expect(synced).toEqual([]);
    expect(time.pendingCount).toBe(0);
  });
});
