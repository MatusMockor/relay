import type { MarkFolderReadBody } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { type AccountScope, type Folder, listParamsOf } from '../../state/folders';
import { showToast } from '../../state/toast-store';
import { useUiStore } from '../../state/ui-store';

const bodyOf = (folder: Folder, scope: AccountScope): MarkFolderReadBody => {
  const { view, accountId, splitId, labelId, mailboxId } = listParamsOf(folder, scope, '');
  return { view, accountId, splitId, labelId, mailboxId };
};

const messageOf = (count: number): string =>
  count > 0 ? `Označené ako prečítané: ${count}` : 'Všetko je už prečítané';

export const useMarkFolderRead = (): ((folder: Folder) => Promise<void>) => {
  const client = useClient();
  const queryClient = useQueryClient();
  return async (folder) => {
    try {
      const { count } = await client.markFolderRead(bodyOf(folder, useUiStore.getState().scope));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.allMailboxes() }),
      ]);
      showToast(messageOf(count));
    } catch (error) {
      showToast(describeError(error));
    }
  };
};
