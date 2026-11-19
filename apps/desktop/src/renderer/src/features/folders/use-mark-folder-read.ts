import { type MarkFolderReadBody, MarkFolderReadBodySchema } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { type AccountScope, type Folder, listParamsOf } from '../../state/folders';
import { showToast } from '../../state/toast-store';

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

const inFlight = new Set<string>();

export type MarkFolderRead = (folder: Folder, scope: AccountScope) => Promise<void>;

export const useMarkFolderRead = (): MarkFolderRead => {
  const client = useClient();
  const queryClient = useQueryClient();
  return async (folder, scope) => {
    const body = bodyOf(folder, scope);
    const key = JSON.stringify(body);
    if (body === null || inFlight.has(key)) {
      return;
    }
    inFlight.add(key);
    try {
      const { count } = await client.markFolderRead(body);
      void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.allMailboxes() });
      showToast(messageOf(count));
    } catch (error) {
      showToast(describeError(error));
    } finally {
      inFlight.delete(key);
    }
  };
};
