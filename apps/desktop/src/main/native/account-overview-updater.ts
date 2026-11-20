import type { Logger } from '@relay/engine';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from '../events/event-hub';
import type { TimerHandle, Timers } from '../platform/timers';
import type { AccountOverview } from './account-overview';

export interface AccountOverviewSource {
  load(): Promise<readonly AccountOverview[]>;
}

export interface AccountOverviewView {
  show(accounts: readonly AccountOverview[]): void;
}

const RELEVANT = new Set<RealtimeEvent['type']>([
  'thread.upserted',
  'thread.removed',
  'threads.changed',
  'account.removed',
  'account.upserted',
  'account.status',
]);

export interface AccountOverviewUpdaterDeps {
  readonly hub: EventHub<RealtimeEvent>;
  readonly source: AccountOverviewSource;
  readonly view: AccountOverviewView;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly debounceMs?: number;
}

export class AccountOverviewUpdater {
  private pending: TimerHandle | null = null;
  private unsubscribe: (() => void) | null = null;
  private running: Promise<void> | null = null;
  private rerun = false;

  constructor(private readonly deps: AccountOverviewUpdaterDeps) {}

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
    this.running = this.reloadUntilSettled();
    return this.running;
  }

  private async reloadUntilSettled(): Promise<void> {
    await this.reload();
    while (this.takeRerun()) {
      await this.reload();
    }
    this.running = null;
  }

  private takeRerun(): boolean {
    const requested = this.rerun;
    this.rerun = false;
    return requested;
  }

  private async reload(): Promise<void> {
    try {
      this.deps.view.show(await this.deps.source.load());
    } catch (error) {
      this.deps.logger.warn('Failed to load the account overview', { error });
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
