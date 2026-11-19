import type { ThreadSummary } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { removeThreadFromView } from '../../data/hooks/thread-cache';
import { useThreadAction } from '../../data/hooks/use-thread-action';
import { showToast } from '../../state/toast-store';
import type { ListItem } from './list-items';
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
  const gatewayFor = (thread: ThreadSummary): CompletionGateway => ({
    openTasks: (threadId) => listOpenThreadTasks(client, threadId),
    setTaskState: (task, state) => client.updateTask(task.id, { state }),
    applyThread: (action) => mutation.mutateAsync({ threadId: thread.id, action }),
  });
  const finish = (result: ChangeResult): ThreadChange => {
    if (result.failure !== null) {
      showToast(describeError(result.failure.error));
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
    return result.change;
  };
  const hide = async (thread: ThreadSummary): Promise<void> => {
    await queryClient.cancelQueries({ queryKey: queryKeys.threadLists() });
    removeThreadFromView(queryClient, 'tasks', thread.id);
  };
  return (thread: ThreadSummary): void => {
    const gateway = gatewayFor(thread);
    retire(items, thread.id);
    const completed = hide(thread)
      .then(() => completeThread(gateway, thread))
      .then(finish);
    showToast('Hotovo', {
      undo: () => {
        void completed.then((change) => revertChange(gateway, thread, change)).then(finish);
      },
    });
  };
};
