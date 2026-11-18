import { type MarkFolderReadBody, MarkFolderReadBodySchema } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { type AccountScope, type Folder, listParamsOf } from '../../state/folders';
import { showToast } from '../../state/toast-store';
import { useUiStore } from '../../state/ui-store';

const bodyOf = (folder: Folder, scope: AccountScope): MarkFolderReadBody | null => {
  const { view, accountId, splitId, labelId, mailboxId } = listParamsOf(folder, scope, '');
  const parsed = MarkFolderReadBodySchema.safeParse({
    view,
    accountId,
    splitId,
    labelId,
    mailboxId,
  });
  return parsed.success ? parsed.data : null;
};

const messageOf = (count: number): string =>
  count > 0 ? `Označené ako prečítané: ${count}` : 'Všetko je už prečítané';

export const useMarkFolderRead = (): ((folder: Folder) => Promise<void>) => {
  const client = useClient();
  const queryClient = useQueryClient();
  return async (folder) => {
    const body = bodyOf(folder, useUiStore.getState().scope);
    if (body === null) {
      return;
    }
    try {
      const { count } = await client.markFolderRead(body);
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
