import type { Clock } from '@relay/engine';

export const systemClock: Clock = { now: () => new Date() };
