import type { ChecklistItem, ThreadDetail, ThreadId } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import { checklistMutationsFor } from './checklist-mutations';

const withItemDone =
  (itemId: string, done: boolean) =>
  (detail: ThreadDetail | undefined): ThreadDetail | undefined =>
    detail === undefined
      ? undefined
      : {
          ...detail,
          checklist: detail.checklist.map((entry) =>
            entry.id === itemId ? { ...entry, done } : entry,
          ),
        };

export const useChecklistToggle = (threadId: ThreadId) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const key = queryKeys.thread(threadId);
  return async (item: ChecklistItem): Promise<void> => {
    await queryClient.cancelQueries({ queryKey: key });
    const done = checklistMutationsFor(client).toggle(threadId, item, (saved, error) => {
      queryClient.setQueryData<ThreadDetail>(key, withItemDone(item.id, saved));
      showToast(`Bod sa nepodarilo uložiť: ${describeError(error)}`);
    });
    queryClient.setQueryData<ThreadDetail>(key, withItemDone(item.id, done));
  };
};
