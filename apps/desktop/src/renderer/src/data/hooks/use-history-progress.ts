import type { AccountId, HistoryProgress } from '@relay/shared';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { invalidateBatched } from './invalidation-batch';
import { queryKeys } from './query-keys';
import { useClient } from './services-context';

export const useHistoryProgress = () => {
  const client = useClient();
  return useQuery({
    queryKey: queryKeys.historyProgress(),
    queryFn: () => client.historyProgress(),
    enabled: client.kind !== 'remote',
  });
};

export const refreshWaitingHistory = (client: QueryClient, accountId: AccountId): void => {
  const cached = client.getQueryData<readonly HistoryProgress[]>(queryKeys.historyProgress());
  const waiting = cached?.some(
    (progress) => progress.accountId === accountId && progress.state === 'waiting',
  );
  if (waiting !== true) {
    return;
  }
  invalidateBatched(client, queryKeys.historyProgress());
};
