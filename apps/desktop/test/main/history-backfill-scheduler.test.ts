import type { HistorySliceReport } from '@relay/engine';
import { ProviderError } from '@relay/engine';
import { type AccountId, AccountIdSchema, MailboxIdSchema } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { HistoryBackfillScheduler } from '../../src/main/background/history-backfill-scheduler';
import type { HistoryLoopState } from '../../src/main/background/history/history-cadence';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';

const accountA = AccountIdSchema.parse('acc_a');
const accountB = AccountIdSchema.parse('acc_b');
const MAILBOX = MailboxIdSchema.parse('mbx_a');

const slice = (more: boolean): HistorySliceReport => ({
  skipped: false,
  processed: more ? 500 : 10,
  more,
  perMailbox: [{ mailboxId: MAILBOX, processed: 10, done: !more }],
});

type Outcome = HistorySliceReport | Error;

const throttled = (): ProviderError =>
  new ProviderError('Mailbox unavailable', {
    cause: Object.assign(new Error('Command failed'), { serverResponseCode: 'OVERQUOTA' }),
  });

const setup = (outcomes: Outcome[], accounts: AccountId[] = [accountA]) => {
  const time = new ManualTime();
  const calls: { accountId: AccountId; at: number }[] = [];
  const states: { accountId: AccountId; state: HistoryLoopState }[] = [];
  const start = time.now().getTime();
  let listed = accounts;
  const scheduler = new HistoryBackfillScheduler({
    listAccounts: () => Promise.resolve(listed.map((id) => ({ id }))),
    backfill: (accountId) => {
      calls.push({ accountId, at: time.now().getTime() - start });
      const next = outcomes.shift() ?? slice(false);
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
    timers: time,
    clock: time,
    logger: createTestLogger().logger,
    cadence: { startDelayMs: 0 },
    onState: (accountId, state) => states.push({ accountId, state }),
  });
  return {
    time,
    calls,
    states,
    scheduler,
    setAccounts: (next: AccountId[]) => {
      listed = next;
    },
  };
};

describe('HistoryBackfillScheduler', () => {
  it('chains slices with a short pause and rechecks a finished history later', async () => {
    const { time, calls, scheduler } = setup([slice(true), slice(true), slice(false)]);
    await scheduler.start();
    await time.advance(0);
    await time.advance(1_500);
    await time.advance(1_500);
    expect(calls.map((call) => call.at)).toEqual([0, 1_500, 3_000]);
    expect(scheduler.stateOf(accountA)).toBe('idle');

    await time.advance(15 * 60_000 - 1);
    expect(calls).toHaveLength(3);
    await time.advance(1);
    expect(calls).toHaveLength(4);
    await scheduler.stop();
  });

  it('retries a busy account soon and waits for mailboxes that are not ready yet', async () => {
    const waiting: HistorySliceReport = {
      skipped: false,
      processed: 0,
      more: false,
      perMailbox: [],
    };
    const { time, calls, scheduler } = setup([{ skipped: true, reason: 'busy' }, waiting]);
    await scheduler.start();
    await time.advance(0);
    await time.advance(5_000);
    await time.advance(60_000);
    expect(calls.map((call) => call.at)).toEqual([0, 5_000, 65_000]);
    await scheduler.stop();
  });

  it('backs off exponentially on errors and resets after a good slice', async () => {
    const failure = new ProviderError('Connection reset');
    const { time, calls, states, scheduler } = setup([failure, failure, slice(true)]);
    await scheduler.start();
    await time.advance(0);
    expect(scheduler.stateOf(accountA)).toBe('error');
    await time.advance(30_000);
    await time.advance(60_000);
    expect(calls.map((call) => call.at)).toEqual([0, 30_000, 90_000]);
    expect(scheduler.stateOf(accountA)).toBe('running');
    expect(states.map((entry) => entry.state)).toEqual(['error', 'running']);
    await scheduler.stop();
  });

  it('pauses for an hour when the server throttles', async () => {
    const { time, calls, scheduler } = setup([throttled()]);
    await scheduler.start();
    await time.advance(0);
    expect(scheduler.stateOf(accountA)).toBe('paused');
    await time.advance(60 * 60_000 - 1);
    expect(calls).toHaveLength(1);
    await time.advance(1);
    expect(calls).toHaveLength(2);
    await scheduler.stop();
  });

  it('keeps the throttling pause across a suspend and resume', async () => {
    const { time, calls, scheduler } = setup([throttled()]);
    await scheduler.start();
    await time.advance(0);
    await time.advance(70_000);
    await scheduler.stop();

    await scheduler.start();
    expect(scheduler.stateOf(accountA)).toBe('paused');
    await time.advance(60 * 60_000 - 70_001);
    expect(calls).toHaveLength(1);
    await time.advance(1);
    expect(calls.map((call) => call.at)).toEqual([0, 60 * 60_000]);
    await scheduler.stop();
  });

  it('keeps the error backoff when the account loop is recreated', async () => {
    const failure = new ProviderError('Connection reset');
    const { time, calls, scheduler, setAccounts } = setup([failure, failure, failure]);
    await scheduler.start();
    await time.advance(0);
    await time.advance(30_000);
    setAccounts([]);
    await scheduler.reconcile();
    setAccounts([accountA]);
    await scheduler.reconcile();

    expect(scheduler.stateOf(accountA)).toBe('error');
    await time.advance(60_000);
    await time.advance(120_000 - 1);
    expect(calls.map((call) => call.at)).toEqual([0, 30_000, 90_000]);
    await time.advance(1);
    expect(calls.map((call) => call.at)).toEqual([0, 30_000, 90_000, 210_000]);
    await scheduler.stop();
  });

  it('follows added and removed accounts and stops all work on stop', async () => {
    const { time, calls, scheduler, setAccounts } = setup(
      Array.from({ length: 20 }, () => slice(true)),
    );
    await scheduler.start();
    await time.advance(0);
    setAccounts([accountA, accountB]);
    await scheduler.reconcile();
    await time.advance(0);
    expect(calls.map((call) => call.accountId)).toEqual([accountA, accountB]);

    setAccounts([accountB]);
    await scheduler.reconcile();
    await time.advance(1_500);
    expect(calls.slice(2).map((call) => call.accountId)).toEqual([accountB]);
    expect(scheduler.stateOf(accountA)).toBeNull();

    await scheduler.stop();
    await time.advance(60 * 60_000);
    expect(calls).toHaveLength(3);
  });
});
