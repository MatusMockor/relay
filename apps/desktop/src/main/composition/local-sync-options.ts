import { DEFAULT_HISTORY_OPTIONS, type HistoryOptions, type SyncOptions } from '@relay/engine';

export const LOCAL_INITIAL_WINDOW_DAYS = 14;

export const localSyncOptions = (
  history: Partial<HistoryOptions> | undefined,
): Partial<SyncOptions> => ({
  initialWindowDays: LOCAL_INITIAL_WINDOW_DAYS,
  ...(history === undefined ? {} : { history: { ...DEFAULT_HISTORY_OPTIONS, ...history } }),
});
