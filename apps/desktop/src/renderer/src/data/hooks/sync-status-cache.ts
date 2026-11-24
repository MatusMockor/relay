import type { RealtimeEventData } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import { refreshWaitingHistory } from './use-history-progress';
import { clearSyncProgress } from './use-sync-progress';

export const settleSyncStatus = (
  client: QueryClient,
  status: RealtimeEventData<'account.status'>,
): void => {
  if (status.status === 'syncing') {
    return;
  }
  clearSyncProgress(client, status.accountId);
  refreshWaitingHistory(client, status.accountId);
};
