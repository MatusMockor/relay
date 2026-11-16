import type { Clock } from '@relay/engine';

export class ShiftedClock implements Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  shift(offsetMs: number): void {
    this.offsetMs = offsetMs;
  }
}
