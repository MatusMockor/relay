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

export const offlineWindowCutoff = (window: OfflineWindow, now: Date): Date | null => {
  if (window === 'all') {
    return null;
  }
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - WINDOW_MONTHS[window]);
  return cutoff;
};

export const OfflineStatsSchema = z.object({
  local: z.number().int().nonnegative(),
  remote: z.number().int().nonnegative(),
});
export type OfflineStats = z.infer<typeof OfflineStatsSchema>;
