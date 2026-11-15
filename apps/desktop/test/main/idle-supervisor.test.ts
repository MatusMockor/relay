import { type AccountId, AccountIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { IdleSupervisor } from '../../src/main/background/idle-supervisor';
import type { MailboxWatcher, StopWatching } from '../../src/main/background/mailbox-watcher';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';

const accountA = AccountIdSchema.parse('acc_a');

class FlakyServerWatcher implements MailboxWatcher {
  readonly attempts: string[] = [];
  readonly stopped: AccountId[] = [];
  readonly active = new Set<AccountId>();

  constructor(
    private readonly time: ManualTime,
    private failuresLeft: number,
  ) {}

  watch(accountId: AccountId): Promise<StopWatching> {
    this.attempts.push(this.time.now().toISOString());
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return Promise.reject(new Error('connection refused'));
    }
    this.active.add(accountId);
    return Promise.resolve(() => {
      this.active.delete(accountId);
      this.stopped.push(accountId);
      return Promise.resolve();
    });
  }
}

describe('IdleSupervisor', () => {
  it('retries a failing IDLE start with exponential backoff until it is watching', async () => {
    const time = new ManualTime();
    const watcher = new FlakyServerWatcher(time, 3);
    const supervisor = new IdleSupervisor({
      watcher,
      timers: time,
      logger: createTestLogger().logger,
      backoff: { initialMs: 1_000, maxMs: 3_000, factor: 2 },
    });
    await supervisor.reconcile([accountA]);
    await time.advance(10_000);
    expect(watcher.attempts).toEqual([
      '2026-11-15T08:00:00.000Z',
      '2026-11-15T08:00:01.000Z',
      '2026-11-15T08:00:03.000Z',
      '2026-11-15T08:00:06.000Z',
    ]);
    expect(supervisor.watching()).toEqual([accountA]);
    expect([...watcher.active]).toEqual([accountA]);
    await supervisor.reconcile([]);
    expect(watcher.stopped).toEqual([accountA]);
    expect(supervisor.watching()).toEqual([]);
  });

  it('stops retrying once the account is no longer watched', async () => {
    const time = new ManualTime();
    const watcher = new FlakyServerWatcher(time, 100);
    const supervisor = new IdleSupervisor({
      watcher,
      timers: time,
      logger: createTestLogger().logger,
    });
    await supervisor.reconcile([accountA]);
    await supervisor.stopAll();
    await time.advance(60 * 60_000);
    expect(watcher.attempts).toHaveLength(1);
    expect(time.pendingCount).toBe(0);
  });

  it('opens a single watch for an account listed twice and stops it on stopAll', async () => {
    const time = new ManualTime();
    const watcher = new FlakyServerWatcher(time, 0);
    const supervisor = new IdleSupervisor({
      watcher,
      timers: time,
      logger: createTestLogger().logger,
    });

    await supervisor.reconcile([accountA, accountA]);
    await supervisor.stopAll();

    expect(watcher.attempts).toHaveLength(1);
    expect(watcher.stopped).toEqual([accountA]);
  });
});
