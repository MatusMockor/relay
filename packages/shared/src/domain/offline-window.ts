import { z } from 'zod';

export const OfflineWindowSchema = z.enum(['3m', '6m', '1y', '5y', 'all']);
export type OfflineWindow = z.infer<typeof OfflineWindowSchema>;

export const DEFAULT_OFFLINE_WINDOW: OfflineWindow = '6m';

const WINDOW_MONTHS: Readonly<Record<Exclude<OfflineWindow, 'all'>, number>> = {
  '3m': 3,
  '6m': 6,
  '1y': 12,
  '5y': 60,
};

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export const monthsBefore = (now: Date, months: number): Date => {
  const cutoff = new Date(now.getTime());
  const target = now.getUTCMonth() - months;
  const year = now.getUTCFullYear() + Math.floor(target / 12);
  const month = ((target % 12) + 12) % 12;
  cutoff.setUTCFullYear(year, month, Math.min(now.getUTCDate(), daysInMonth(year, month)));
  return cutoff;
};

export const offlineWindowCutoff = (window: OfflineWindow, now: Date): Date | null => {
  if (window === 'all') {
    return null;
  }
  return monthsBefore(now, WINDOW_MONTHS[window]);
};

export const OfflineStatsSchema = z.object({
  local: z.number().int().nonnegative(),
  remote: z.number().int().nonnegative(),
});
export type OfflineStats = z.infer<typeof OfflineStatsSchema>;
