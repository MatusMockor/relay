import type { NotificationPauseState } from './notification-pause';
import type { TraySyncStatus } from './tray-sync-status';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const elapsedLabel = (elapsedMs: number): string => {
  if (elapsedMs < MINUTE_MS) {
    return 'práve teraz';
  }
  if (elapsedMs < HOUR_MS) {
    return `pred ${String(Math.floor(elapsedMs / MINUTE_MS))} min`;
  }
  if (elapsedMs < DAY_MS) {
    return `pred ${String(Math.floor(elapsedMs / HOUR_MS))} h`;
  }
  return `pred ${String(Math.floor(elapsedMs / DAY_MS))} d`;
};

export const syncStatusLabel = (status: TraySyncStatus, now: Date): string => {
  if (status.kind === 'no-accounts') {
    return 'Žiadny pripojený účet';
  }
  if (status.kind === 'waiting') {
    return 'Čaká na prvú synchronizáciu';
  }
  if (status.kind === 'syncing') {
    return 'Synchronizuje sa…';
  }
  if (status.kind === 'failed') {
    return 'Synchronizácia zlyhala';
  }
  return `Synchronizované ${elapsedLabel(Math.max(0, now.getTime() - status.at.getTime()))}`;
};

export const unreadLabel = (count: number): string => {
  if (count === 1) {
    return '1 neprečítaná';
  }
  if (count >= 2 && count <= 4) {
    return `${String(count)} neprečítané`;
  }
  return `${String(count)} neprečítaných`;
};

const clockTime = (date: Date): string =>
  `${String(date.getHours())}:${String(date.getMinutes()).padStart(2, '0')}`;

const dayStart = (date: Date): number =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const untilLabel = (until: Date, now: Date): string => {
  const days = Math.round((dayStart(until) - dayStart(now)) / DAY_MS);
  if (days === 0) {
    return `do ${clockTime(until)}`;
  }
  if (days === 1) {
    return `do zajtra ${clockTime(until)}`;
  }
  return `do ${String(until.getDate())}. ${String(until.getMonth() + 1)}. ${clockTime(until)}`;
};

export const pauseLabel = (
  pause: Extract<NotificationPauseState, { kind: 'paused' }>,
  now: Date,
): string => {
  if (pause.until === null) {
    return 'Notifikácie pozastavené';
  }
  return `Notifikácie pozastavené ${untilLabel(pause.until, now)}`;
};
