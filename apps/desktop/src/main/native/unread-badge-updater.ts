import type { Logger } from '@relay/engine';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from '../events/event-hub';
import type { TimerHandle, Timers } from '../platform/timers';

export interface UnreadSource {
  count(): Promise<number>;
}

export interface UnreadView {
  setUnread(count: number): void;
}

const RELEVANT = new Set<RealtimeEvent['type']>([
  'thread.upserted',
  'thread.removed',
  'account.removed',
  'account.upserted',
]);

export interface UnreadBadgeUpdaterDeps {
  readonly hub: EventHub<RealtimeEvent>;
  readonly source: UnreadSource;
  readonly view: UnreadView;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly debounceMs?: number;
}

export class UnreadBadgeUpdater {
  private pending: TimerHandle | null = null;
  private unsubscribe: (() => void) | null = null;
  private running: Promise<void> | null = null;
  private rerun = false;

  constructor(private readonly deps: UnreadBadgeUpdaterDeps) {}

  start(): void {
    this.unsubscribe ??= this.deps.hub.subscribe((event) => {
      if (!RELEVANT.has(event.type)) {
        return;
      }
      this.schedule();
    });
    void this.refresh();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pending?.cancel();
    this.pending = null;
  }

  refresh(): Promise<void> {
    if (this.running !== null) {
      this.rerun = true;
      return this.running;
    }
    this.running = this.recountUntilSettled();
    return this.running;
  }

  private async recountUntilSettled(): Promise<void> {
    await this.recount();
    while (this.takeRerun()) {
      await this.recount();
    }
    this.running = null;
  }

  private takeRerun(): boolean {
    const requested = this.rerun;
    this.rerun = false;
    return requested;
  }

  private async recount(): Promise<void> {
    try {
      this.deps.view.setUnread(await this.deps.source.count());
    } catch (error) {
      this.deps.logger.warn('Failed to count unread threads', { error });
    }
  }

  private schedule(): void {
    if (this.pending !== null) {
      return;
    }
    this.pending = this.deps.timers.after(this.deps.debounceMs ?? 500, () => {
      this.pending = null;
      void this.refresh();
    });
  }
}
