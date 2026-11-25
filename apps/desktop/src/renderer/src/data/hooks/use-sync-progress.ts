import type { AccountId, RealtimeEventData } from '@relay/shared';
import { type QueryClient, skipToken, useQuery } from '@tanstack/react-query';
import { queryKeys } from './query-keys';

export type SyncProgress = RealtimeEventData<'sync.progress'>;

export const recordSyncProgress = (client: QueryClient, progress: SyncProgress): void => {
  if (progress.mailboxId !== null) {
    return;
  }
  client.setQueryData<SyncProgress | null>(queryKeys.syncProgress(progress.accountId), progress);
};

export const clearSyncProgress = (client: QueryClient, accountId: AccountId): void => {
  client.setQueryData<SyncProgress | null>(queryKeys.syncProgress(accountId), null);
};

const NO_PROGRESS_KEY = ['mail', 'sync', 'progress', 'none'] as const;

export const useSyncProgress = (accountId: AccountId | null): SyncProgress | null =>
  useQuery<SyncProgress | null>({
    queryKey: accountId === null ? NO_PROGRESS_KEY : queryKeys.syncProgress(accountId),
    queryFn: skipToken,
  }).data ?? null;
