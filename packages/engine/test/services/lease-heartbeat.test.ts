import { describe, expect, it } from 'vitest';
import { LeaseLostError } from '../../src';
import { LeaseHeartbeat } from '../../src/services/shared/lease-heartbeat';
import { MemoryLogger } from '../support/fakes/infrastructure';
import { ManualIntervalTimer } from '../support/fakes/manual-interval-timer';

const scriptedRenewal = (answers: ReadonlyArray<boolean | Error>) => {
  const remaining = [...answers];
  const renewal = {
    intervalMs: 1_000,
    calls: 0,
    renew: (): Promise<boolean> => {
      renewal.calls += 1;
      const answer = remaining.shift() ?? true;
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  };
  return renewal;
};

describe('LeaseHeartbeat', () => {
  it('keeps the lease when a renewal fails transiently and renews again on the next beat', async () => {
    const timer = new ManualIntervalTimer();
    const logger = new MemoryLogger();
    const renewal = scriptedRenewal([new Error('connection reset'), true, true]);
    const lease = new LeaseHeartbeat(timer, logger).start(renewal, { jobId: 'job_1' });

    await timer.fire();
    await timer.fire();
    await lease.ensureHeld();
    lease.stop();

    expect(lease.signal.aborted).toBe(false);
    expect(renewal.calls).toBe(3);
    expect(logger.entries.map((entry) => entry.message)).toEqual(['Renewing a lease failed']);
    expect(timer.intervals).toEqual([]);
  });

  it('stays lost once a renewal finds the lease taken over', async () => {
    const timer = new ManualIntervalTimer();
    const renewal = scriptedRenewal([false, true]);
    const lease = new LeaseHeartbeat(timer, new MemoryLogger()).start(renewal, {});

    await timer.fire();
    await timer.fire();

    expect(lease.signal.aborted).toBe(true);
    expect(lease.signal.reason).toBeInstanceOf(LeaseLostError);
    await expect(lease.ensureHeld()).rejects.toThrow(LeaseLostError);
    expect(renewal.calls).toBe(1);
  });

  it('propagates a failing renewal from the check before the owner commits', async () => {
    const timer = new ManualIntervalTimer();
    const renewal = scriptedRenewal([new Error('connection reset')]);
    const heartbeat = new LeaseHeartbeat(timer, new MemoryLogger());

    await expect(heartbeat.hold(renewal, {}, (lease) => lease.ensureHeld())).rejects.toThrow(
      'connection reset',
    );
    expect(timer.intervals).toEqual([]);
  });

  it('waits for an in-flight renewal and never runs two at once', async () => {
    const timer = new ManualIntervalTimer();
    const answers: Array<(held: boolean) => void> = [];
    const renewal = {
      intervalMs: 1_000,
      renew: () =>
        new Promise<boolean>((resolve) => {
          answers.push(resolve);
        }),
    };
    const lease = new LeaseHeartbeat(timer, new MemoryLogger()).start(renewal, {});

    const beat = timer.fire();
    const check = lease.ensureHeld().then(
      () => 'held',
      (error: unknown) => error,
    );
    await Promise.resolve();
    expect(answers).toHaveLength(1);
    answers[0]?.(false);
    await beat;

    expect(await check).toBeInstanceOf(LeaseLostError);
    expect(answers).toHaveLength(1);
  });

  it('coalesces a beat into the renewal of a running check', async () => {
    const timer = new ManualIntervalTimer();
    const answers: Array<(held: boolean) => void> = [];
    const renewal = {
      intervalMs: 1_000,
      renew: () =>
        new Promise<boolean>((resolve) => {
          answers.push(resolve);
        }),
    };
    const lease = new LeaseHeartbeat(timer, new MemoryLogger()).start(renewal, {});

    const check = lease.ensureHeld();
    await Promise.resolve();
    const beat = timer.fire();
    expect(answers).toHaveLength(1);
    answers[0]?.(true);
    await Promise.all([check, beat]);

    expect(lease.signal.aborted).toBe(false);
    expect(answers).toHaveLength(1);
  });
});
