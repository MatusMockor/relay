import { describe, expect, it } from 'vitest';
import { createAppUpdates } from '../../src/main/composition/app-updates';
import type { UpdateAvailability } from '../../src/main/updates/update-availability';
import { InMemoryAppUpdater } from './support/in-memory-app-updater';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';

const TIMING = { initialDelayMs: 30_000, intervalMs: 3_600_000 };

const setup = (availability: UpdateAvailability) => {
  const time = new ManualTime();
  const updater = new InMemoryAppUpdater();
  let loads = 0;
  const updates = createAppUpdates({
    availability,
    loadUpdater: () => {
      loads += 1;
      return Promise.resolve(updater);
    },
    timers: time,
    logger: createTestLogger().logger,
    timing: TIMING,
  });
  return { time, updater, updates, loads: () => loads };
};

describe('scheduled update checks', () => {
  it('checks shortly after start and then periodically', async () => {
    const { time, updater, updates, loads } = setup({ enabled: true });
    updates.start();
    await time.advance(29_000);
    expect(updater.checks).toBe(0);
    expect(loads()).toBe(0);
    await time.advance(1_000);
    expect(updater.checks).toBe(1);
    await time.advance(TIMING.intervalMs);
    expect(updater.checks).toBe(2);
    expect(loads()).toBe(1);
    updates.stop();
    await time.advance(TIMING.intervalMs * 3);
    expect(updater.checks).toBe(2);
  });

  it('never schedules a check or loads the updater when updates are off', async () => {
    const { time, updater, updates, loads } = setup({ enabled: false, reason: 'manual-package' });
    updates.start();
    await time.advance(TIMING.intervalMs * 2);
    expect(updater.checks).toBe(0);
    expect(loads()).toBe(0);
    expect(time.pendingCount).toBe(0);
    expect(updates.service.status()).toEqual({ kind: 'disabled', reason: 'manual-package' });
  });

  it('keeps checking after the updater failed to load', async () => {
    const time = new ManualTime();
    const updater = new InMemoryAppUpdater();
    let attempts = 0;
    const updates = createAppUpdates({
      availability: { enabled: true },
      loadUpdater: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error('no app-update.yml'))
          : Promise.resolve(updater);
      },
      timers: time,
      logger: createTestLogger().logger,
      timing: TIMING,
    });
    updates.start();
    await time.advance(TIMING.initialDelayMs);
    expect(updates.service.status()).toEqual({ kind: 'error', failed: 'check' });
    await time.advance(TIMING.intervalMs);
    expect(updater.checks).toBe(1);
    expect(updates.service.status()).toEqual({ kind: 'idle' });
  });
});
