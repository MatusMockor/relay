import type { Clock } from '@relay/engine';
import { EventHub } from '../events/event-hub';
import type { TimerHandle, Timers } from '../platform/timers';
import { type PauseDuration, pauseEnd } from './pause-end';

export type NotificationPauseState =
  | { readonly kind: 'active' }
  | { readonly kind: 'paused'; readonly until: Date | null };

const ACTIVE: NotificationPauseState = { kind: 'active' };

export class NotificationPause {
  readonly changes = new EventHub<NotificationPauseState>();
  private until: Date | null = null;
  private paused = false;
  private expiry: TimerHandle | null = null;

  constructor(
    private readonly clock: Clock,
    private readonly timers: Timers,
  ) {}

  state(): NotificationPauseState {
    if (!this.paused || this.hasExpired()) {
      return ACTIVE;
    }
    return { kind: 'paused', until: this.until };
  }

  isPaused(): boolean {
    return this.state().kind === 'paused';
  }

  pause(duration: PauseDuration): void {
    this.clearExpiry();
    this.paused = true;
    this.until = pauseEnd(duration, this.clock.now());
    this.scheduleExpiry();
    this.changes.publish(this.state());
  }

  resume(): void {
    this.clearExpiry();
    const wasPaused = this.isPaused();
    this.paused = false;
    this.until = null;
    if (!wasPaused) {
      return;
    }
    this.changes.publish(ACTIVE);
  }

  dispose(): void {
    this.clearExpiry();
  }

  private hasExpired(): boolean {
    return this.until !== null && this.until.getTime() <= this.clock.now().getTime();
  }

  private scheduleExpiry(): void {
    if (this.until === null) {
      return;
    }
    const delay = Math.max(0, this.until.getTime() - this.clock.now().getTime());
    this.expiry = this.timers.after(delay, () => {
      this.expiry = null;
      this.paused = false;
      this.until = null;
      this.changes.publish(ACTIVE);
    });
  }

  private clearExpiry(): void {
    this.expiry?.cancel();
    this.expiry = null;
  }
}
