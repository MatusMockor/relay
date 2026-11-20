import type { EvictionReport, Logger } from '@relay/engine';
import type { DeviceSettings, OfflineWindow } from '@relay/shared/domain';
import type { TimerHandle, Timers } from '../platform/timers';
import type { BackgroundWorker } from './background-worker';

export interface OfflineWindowSettings {
  get(): Promise<DeviceSettings>;
  onChange(listener: (settings: DeviceSettings) => void): () => void;
}

export interface OfflineWindowReactorDeps {
  readonly settings: OfflineWindowSettings;
  readonly evict: () => Promise<EvictionReport>;
  readonly kick: () => void;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly pauseMs?: number;
  readonly maxTicks?: number;
}

const DEFAULT_PAUSE_MS = 250;
const DEFAULT_MAX_TICKS = 500;

export class OfflineWindowReactor implements BackgroundWorker {
  readonly name = 'offline-window';
  private current: OfflineWindow | null = null;
  private unsubscribe: (() => void) | null = null;
  private draining: Promise<void> | null = null;
  private generation = 0;
  private waiting: { readonly handle: TimerHandle; readonly resolve: () => void } | null = null;

  constructor(private readonly deps: OfflineWindowReactorDeps) {}

  async start(): Promise<void> {
    this.generation += 1;
    this.unsubscribe ??= this.deps.settings.onChange((settings) => {
      this.changed(settings.offlineWindow);
    });
    this.current = (await this.deps.settings.get()).offlineWindow;
  }

  async stop(): Promise<void> {
    this.generation += 1;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.waiting?.handle.cancel();
    this.waiting?.resolve();
    this.waiting = null;
    await this.idle();
  }

  idle(): Promise<void> {
    return this.draining ?? Promise.resolve();
  }

  private changed(window: OfflineWindow): void {
    if (window === this.current) {
      return;
    }
    this.current = window;
    this.deps.kick();
    if (this.draining !== null) {
      return;
    }
    this.draining = this.drain(this.generation).finally(() => {
      this.draining = null;
    });
  }

  private async drain(generation: number): Promise<void> {
    const maxTicks = this.deps.maxTicks ?? DEFAULT_MAX_TICKS;
    for (let tick = 0; tick < maxTicks && generation === this.generation; tick += 1) {
      const report = await this.deps.evict().catch((error: unknown) => {
        this.deps.logger.warn('Offline body eviction failed', { error });
        return { evicted: 0, more: false };
      });
      if (!report.more) {
        return;
      }
      await this.pause();
    }
  }

  private pause(): Promise<void> {
    return new Promise((resolve) => {
      const handle = this.deps.timers.after(this.deps.pauseMs ?? DEFAULT_PAUSE_MS, () => {
        this.waiting = null;
        resolve();
      });
      this.waiting = { handle, resolve };
    });
  }
}
