import type { CalendarInviteWork } from '../../model/pending-work';

const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
const MAX_ERROR_LENGTH = 500;

export const isDue = (work: CalendarInviteWork, now: Date): boolean =>
  work.failedAt === null &&
  (work.nextAttemptAt === null || Date.parse(work.nextAttemptAt) <= now.getTime());

export const afterConflict = (
  work: CalendarInviteWork,
  now: Date,
  error: string,
): CalendarInviteWork => {
  const delay = RETRY_DELAYS_MS[Math.min(work.attempts, RETRY_DELAYS_MS.length - 1)] ?? 0;
  const nextAttemptAt = new Date(now.getTime() + delay).toISOString();
  return { ...work, nextAttemptAt, lastError: error.slice(0, MAX_ERROR_LENGTH) };
};

export const afterFailure = (
  work: CalendarInviteWork,
  now: Date,
  error: string,
): CalendarInviteWork => {
  const attempts = work.attempts + 1;
  const delay = RETRY_DELAYS_MS[attempts - 1];
  const lastError = error.slice(0, MAX_ERROR_LENGTH);
  if (delay === undefined) {
    return { ...work, attempts, nextAttemptAt: null, failedAt: now.toISOString(), lastError };
  }
  const nextAttemptAt = new Date(now.getTime() + delay).toISOString();
  return { ...work, attempts, nextAttemptAt, lastError };
};

export const retryNow = (work: CalendarInviteWork): CalendarInviteWork => ({
  ...work,
  attempts: 0,
  nextAttemptAt: null,
  failedAt: null,
  lastError: null,
});
