import type { EvictionReport } from '@relay/engine';
import type { DeviceSettings } from '@relay/shared/domain';
import { describe, expect, it } from 'vitest';
import { OfflineWindowReactor } from '../../src/main/background/offline-window-reactor';
import { DeviceSettingsStore } from '../../src/main/settings/device-settings-store';
import type { JsonDocument } from '../../src/main/storage/json-file';
import { ManualTime } from './support/manual-time';
import { createTestLogger } from './support/memory-log-sink';

class MemoryDocument implements JsonDocument<DeviceSettings> {
  private value: DeviceSettings | null = null;

  read(): Promise<DeviceSettings | null> {
    return Promise.resolve(this.value);
  }

  write(value: DeviceSettings): Promise<void> {
    this.value = value;
    return Promise.resolve();
  }
}

const setup = (reports: EvictionReport[]) => {
  const time = new ManualTime();
  const settings = new DeviceSettingsStore(new MemoryDocument());
  const calls = { evict: 0, kick: 0 };
  const reactor = new OfflineWindowReactor({
    settings,
    evict: () => {
      calls.evict += 1;
      return Promise.resolve(reports.shift() ?? { evicted: 0, more: false });
    },
    kick: () => {
      calls.kick += 1;
    },
    timers: time,
    logger: createTestLogger().logger,
    pauseMs: 100,
  });
  return { time, settings, calls, reactor };
};

describe('OfflineWindowReactor', () => {
  it('evicts until done and kicks the history scheduler only when the window changes', async () => {
    const { time, settings, calls, reactor } = setup([
      { evicted: 2_000, more: true },
      { evicted: 300, more: false },
    ]);
    await reactor.start();

    await settings.update({ theme: 'paper' });
    await settings.update({ offlineWindow: '6m' });
    expect(calls).toEqual({ evict: 0, kick: 0 });

    await settings.update({ offlineWindow: '3m' });
    expect(calls).toEqual({ evict: 1, kick: 1 });
    await time.advance(100);
    await reactor.idle();

    expect(calls).toEqual({ evict: 2, kick: 1 });
    await reactor.stop();
  });

  it('stops a drain that waits between ticks and ignores changes after stop', async () => {
    const { time, settings, calls, reactor } = setup([
      { evicted: 2_000, more: true },
      { evicted: 2_000, more: true },
    ]);
    await reactor.start();
    await settings.update({ offlineWindow: '3m' });
    await time.advance(0);
    expect(calls.evict).toBe(1);

    await reactor.stop();
    await settings.update({ offlineWindow: '1y' });
    await time.advance(1_000);

    expect(calls).toEqual({ evict: 1, kick: 1 });
    expect(time.pendingCount).toBe(0);
  });
});
