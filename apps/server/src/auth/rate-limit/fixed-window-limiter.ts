import type { Clock } from '@relay/engine';

export interface RateLimitPolicy {
  readonly maxRequests: number;
  readonly windowMs: number;
}

interface Window {
  count: number;
  readonly resetsAt: number;
}

const SWEEP_THRESHOLD = 10_000;

export class FixedWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly policy: RateLimitPolicy,
    private readonly clock: Clock,
  ) {}

  tryAcquire(keys: readonly string[]): boolean {
    const now = this.clock.now().getTime();
    this.sweep(now);
    const windows = keys.map((key) => this.current(key, now));
    if (windows.some((window) => window.count >= this.policy.maxRequests)) {
      return false;
    }
    windows.forEach((window) => {
      window.count += 1;
    });
    return true;
  }

  private current(key: string, now: number): Window {
    const existing = this.windows.get(key);
    if (existing !== undefined && existing.resetsAt > now) {
      return existing;
    }
    const fresh: Window = { count: 0, resetsAt: now + this.policy.windowMs };
    this.windows.set(key, fresh);
    return fresh;
  }

  private sweep(now: number): void {
    if (this.windows.size < SWEEP_THRESHOLD) {
      return;
    }
    this.windows.forEach((window, key) => {
      if (window.resetsAt <= now) {
        this.windows.delete(key);
      }
    });
  }
}
