export type PauseDuration = 'hour' | 'morning' | 'indefinite';

const HOUR_MS = 60 * 60_000;
const MORNING_HOUR = 8;

export const nextMorning = (now: Date): Date => {
  const dayOffset = now.getHours() < MORNING_HOUR ? 0 : 1;
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + dayOffset,
    MORNING_HOUR,
    0,
    0,
    0,
  );
};

export const pauseEnd = (duration: PauseDuration, now: Date): Date | null => {
  if (duration === 'hour') {
    return new Date(now.getTime() + HOUR_MS);
  }
  if (duration === 'morning') {
    return nextMorning(now);
  }
  return null;
};
