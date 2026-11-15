import type { Clock } from '@relay/engine';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
