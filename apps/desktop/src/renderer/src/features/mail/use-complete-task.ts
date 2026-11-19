import type { ThreadSummary } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { removeThreadFromView } from '../../data/hooks/thread-cache';
import { useThreadAction } from '../../data/hooks/use-thread-action';
import { showToast } from '../../state/toast-store';
import type { ListItem } from './list-items';
import { usePendingCompletions } from './pending-completions';
import { retire } from './retire';
import {
  type ChangeResult,
  type CompletionGateway,
  completeThread,
  revertChange,
  type ThreadChange,
} from './task-completion';
import { listOpenThreadTasks } from './thread-open-tasks';

export const useCompleteTask = (items: readonly ListItem[]) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const mutation = useThreadAction();
  const pending = usePendingCompletions('tasks');
  const gatewayFor = (thread: ThreadSummary): CompletionGateway => ({
    openTasks: (threadId) => listOpenThreadTasks(client, threadId),
    setTaskState: (task, state) => client.updateTask(task.id, { state }),
    applyThread: (action) => mutation.mutateAsync({ threadId: thread.id, action }),
    now: () => Date.now(),
  });
  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
  };
  const undoOf =
    (gateway: CompletionGateway, thread: ThreadSummary, change: Promise<ThreadChange>) =>
    (): void => {
      void change
        .then((current) => revertChange(gateway, thread, current))
        .then((result) => {
          refresh();
          if (result.failure === null) {
            return;
          }
          showToast(describeError(result.failure.error), {
            undo: undoOf(gateway, thread, Promise.resolve(result.change)),
          });
        });
    };
  const finish =
    (thread: ThreadSummary) =>
    (result: ChangeResult): ThreadChange => {
      pending.remove(thread.id);
      if (result.failure !== null) {
        showToast(describeError(result.failure.error));
      }
      refresh();
      return result.change;
    };
  const hide = async (thread: ThreadSummary): Promise<void> => {
    await queryClient.cancelQueries({ queryKey: queryKeys.threadLists() });
    removeThreadFromView(queryClient, 'tasks', thread.id);
  };
  return (thread: ThreadSummary): void => {
    const gateway = gatewayFor(thread);
    pending.add(thread.id);
    retire(items, thread.id);
    const completed = hide(thread)
      .then(() => completeThread(gateway, thread))
      .then(finish(thread));
    showToast('Hotovo', { undo: undoOf(gateway, thread, completed) });
  };
};
