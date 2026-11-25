import type { MailAccount } from '@relay/shared';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { showToast } from '../../state/toast-store';
import { describeError } from '../errors';
import { settleAccountReorders } from './account-list-refresh';
import { accountReorderMutationKey, queryKeys } from './query-keys';
import { useClient } from './services-context';

const confirmed = new WeakMap<QueryClient, MailAccount[]>();

export const useReorderAccounts = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const key = queryKeys.accounts();
  const onlyReorder = () => queryClient.isMutating({ mutationKey: accountReorderMutationKey }) <= 1;
  return useMutation<MailAccount[], Error, readonly MailAccount[]>({
    mutationKey: accountReorderMutationKey,
    scope: { id: 'account-order' },
    mutationFn: (ordered) => client.reorderAccounts(ordered.map((account) => account.id)),
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey: key });
      const current = queryClient.getQueryData<MailAccount[]>(key);
      if (!confirmed.has(queryClient) && current !== undefined) {
        confirmed.set(queryClient, current);
      }
      queryClient.setQueryData(key, [...ordered]);
    },
    onSuccess: (stored) => {
      confirmed.set(queryClient, stored);
    },
    onError: (error) => {
      showToast(describeError(error));
      const baseline = confirmed.get(queryClient);
      if (onlyReorder() && baseline !== undefined) {
        queryClient.setQueryData(key, baseline);
      }
    },
    onSettled: async () => {
      if (!onlyReorder()) {
        return;
      }
      confirmed.delete(queryClient);
      await settleAccountReorders(queryClient);
    },
  });
};
