import type { TimerHandle, Timers } from '../platform/timers';

export type ErrorReporter = (error: unknown) => void;

export class PeriodicRunner {
  private timer: TimerHandle | null = null;
  private current: Promise<void> | null = null;
  private rerun = false;
  private active = false;

  constructor(
    private readonly task: () => Promise<void>,
    private intervalMs: number,
    private readonly timers: Timers,
    private readonly reportError: ErrorReporter,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  get interval(): number {
    return this.intervalMs;
  }

  start(initialDelayMs = 0): void {
    if (this.active) {
      return;
    }
    this.active = true;
    this.schedule(initialDelayMs);
  }

  stop(): void {
    this.active = false;
    this.rerun = false;
    this.clearTimer();
  }

  setInterval(intervalMs: number): void {
    if (intervalMs === this.intervalMs) {
      return;
    }
    this.intervalMs = intervalMs;
    if (this.current !== null || !this.active) {
      return;
    }
    this.schedule(intervalMs);
  }

  trigger(): Promise<void> {
    if (this.current !== null) {
      this.rerun = true;
      return this.current;
    }
    this.clearTimer();
    this.current = this.execute();
    return this.current;
  }

  idle(): Promise<void> {
    return this.current ?? Promise.resolve();
  }

  private async execute(): Promise<void> {
    try {
      await Promise.resolve().then(() => this.task());
    } catch (error) {
      this.reportError(error);
    }
    this.current = null;
    if (this.rerun && this.active) {
      this.rerun = false;
      return this.trigger();
    }
    this.rerun = false;
    if (this.active) {
      this.schedule(this.intervalMs);
    }
  }

  private schedule(delayMs: number): void {
    this.clearTimer();
    this.timer = this.timers.after(delayMs, () => {
      this.timer = null;
      void this.trigger();
    });
  }

  private clearTimer(): void {
    this.timer?.cancel();
    this.timer = null;
  }
}
