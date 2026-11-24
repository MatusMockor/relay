import type { AccountId } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { AccountRunQueue } from '../../src/services/sync/account-run-queue';

const ACCOUNT = 'account_1' as AccountId;

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe('AccountRunQueue exclusive runs', () => {
  it('waits for the active run, never overlaps a queued sync and makes history yield', async () => {
    const queue = new AccountRunQueue<string>();
    const log: string[] = [];
    const history = deferred();
    const running = queue.history(ACCOUNT, async () => {
      log.push('history:start');
      await history.promise;
      log.push('history:end');
    });

    const exclusive = queue.exclusive(ACCOUNT, async () => {
      log.push('exclusive:start');
      await Promise.resolve();
      log.push('exclusive:end');
      return 'searched';
    });
    expect(queue.hasPendingWork(ACCOUNT)).toBe(true);
    expect(queue.hasPendingSync(ACCOUNT)).toBe(false);
    const sync = queue.sync(ACCOUNT, () => {
      log.push('sync');
      return Promise.resolve('synced');
    });
    history.resolve();

    await expect(Promise.all([running, exclusive, sync])).resolves.toEqual([
      undefined,
      'searched',
      'synced',
    ]);
    expect(log).toEqual([
      'history:start',
      'history:end',
      'exclusive:start',
      'exclusive:end',
      'sync',
    ]);
    expect(queue.hasPendingWork(ACCOUNT)).toBe(false);
  });
});
