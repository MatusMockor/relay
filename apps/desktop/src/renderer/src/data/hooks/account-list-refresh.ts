import type { QueryClient } from '@tanstack/react-query';
import { INVALIDATION_WINDOW_MS } from './invalidation-batch';
import { accountReorderMutationKey, queryKeys } from './query-keys';

const deferred = new WeakSet<QueryClient>();
const scheduled = new WeakSet<QueryClient>();

const reorderPending = (client: QueryClient): boolean =>
  client.isMutating({ mutationKey: accountReorderMutationKey }) > 0;

const refreshNow = (client: QueryClient): void => {
  if (reorderPending(client)) {
    deferred.add(client);
    return;
  }
  void client.invalidateQueries({ queryKey: queryKeys.accounts() });
};

export const refreshAccounts = (client: QueryClient): void => {
  if (scheduled.has(client)) {
    return;
  }
  scheduled.add(client);
  setTimeout(() => {
    scheduled.delete(client);
    refreshNow(client);
  }, INVALIDATION_WINDOW_MS);
};

export const settleAccountReorders = async (client: QueryClient): Promise<void> => {
  deferred.delete(client);
  await client.invalidateQueries({ queryKey: queryKeys.accounts() });
  setTimeout(() => {
    if (deferred.delete(client)) {
      refreshNow(client);
    }
  }, 0);
};
