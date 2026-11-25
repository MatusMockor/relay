import type { MailAccount } from '@relay/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { showToast } from '../../state/toast-store';
import { describeError } from '../errors';
import { settleAccountReorders } from './account-list-refresh';
import { accountReorderMutationKey, queryKeys } from './query-keys';
import { useClient } from './services-context';

interface AccountsSnapshot {
  readonly previous: MailAccount[] | undefined;
}

export const useReorderAccounts = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const key = queryKeys.accounts();
  const onlyReorder = () => queryClient.isMutating({ mutationKey: accountReorderMutationKey }) <= 1;
  return useMutation<MailAccount[], Error, readonly MailAccount[], AccountsSnapshot>({
    mutationKey: accountReorderMutationKey,
    scope: { id: 'account-order' },
    mutationFn: (ordered) => client.reorderAccounts(ordered.map((account) => account.id)),
    onMutate: async (ordered) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MailAccount[]>(key);
      queryClient.setQueryData(key, [...ordered]);
      return { previous };
    },
    onError: (error, _ordered, snapshot) => {
      showToast(describeError(error));
      if (onlyReorder() && snapshot?.previous !== undefined) {
        queryClient.setQueryData(key, snapshot.previous);
      }
    },
    onSettled: async () => {
      if (!onlyReorder()) {
        return;
      }
      await settleAccountReorders(queryClient);
    },
  });
};
