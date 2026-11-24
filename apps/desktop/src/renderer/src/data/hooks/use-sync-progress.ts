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

export const useSyncProgress = (accountId: AccountId): SyncProgress | null =>
  useQuery<SyncProgress | null>({ queryKey: queryKeys.syncProgress(accountId), queryFn: skipToken })
    .data ?? null;
