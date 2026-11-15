import type { Clock } from '@relay/engine';
import type { TimerHandle, Timers } from '../../../src/main/platform/timers';

interface PendingTimer {
  readonly id: number;
  readonly dueAt: number;
  readonly callback: () => void;
}

const flushMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 20; index += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
};

export class ManualTime implements Clock, Timers {
  private current: number;
  private sequence = 0;
  private pending: PendingTimer[] = [];

  constructor(start = '2026-11-15T08:00:00.000Z') {
    this.current = Date.parse(start);
  }

  now(): Date {
    return new Date(this.current);
  }

  after(delayMs: number, callback: () => void): TimerHandle {
    this.sequence += 1;
    const timer = { id: this.sequence, dueAt: this.current + delayMs, callback };
    this.pending.push(timer);
    return {
      cancel: () => {
        this.pending = this.pending.filter((entry) => entry.id !== timer.id);
      },
    };
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    await flushMicrotasks();
    for (;;) {
      const next = this.nextDue(target);
      if (next === undefined) {
        break;
      }
      this.pending = this.pending.filter((entry) => entry.id !== next.id);
      this.current = next.dueAt;
      next.callback();
      await flushMicrotasks();
    }
    this.current = target;
  }

  private nextDue(target: number): PendingTimer | undefined {
    return [...this.pending]
      .filter((entry) => entry.dueAt <= target)
      .sort((left, right) => left.dueAt - right.dueAt || left.id - right.id)[0];
  }
}
