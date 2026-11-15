import { type AccountId, AccountIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import {
  AccountSyncScheduler,
  type SyncableAccount,
} from '../../src/main/background/account-sync-scheduler';
import { IdleSupervisor } from '../../src/main/background/idle-supervisor';
import type { StopWatching } from '../../src/main/background/mailbox-watcher';
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

  it('closes an IDLE connection that finishes connecting after the account was released', async () => {
    const time = new ManualTime();
    const connecting = deferred<StopWatching>();
    const stopped: string[] = [];
    const supervisor = new IdleSupervisor({
      watcher: { watch: () => connecting.promise },
      timers: time,
      logger: createTestLogger().logger,
    });
    const watching = supervisor.reconcile([accountA]);
    await time.advance(0);
    const releasing = supervisor.reconcile([]);
    connecting.resolve(() => {
      stopped.push('closed');
      return Promise.resolve();
    });
    await Promise.all([watching, releasing]);
    expect(stopped).toEqual(['closed']);
    expect(supervisor.watching()).toEqual([]);
  });
});
