import type { TaskId, TaskPriority, ThreadSummary } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import { usePendingPriorityStore } from './pending-priorities';
import { priorityTitle } from './priority-labels';
import { type PriorityGateway, writePriority } from './priority-write';
import { confirmTaskPriority } from './task-priority-cache';
import { threadPriority } from './thread-priorities';

export type SetThreadPriority = (thread: ThreadSummary, priority: TaskPriority) => void;

export const useSetTaskPriority = (): SetThreadPriority => {
  const client = useClient();
  const queryClient = useQueryClient();
  const gateway: PriorityGateway = {
    update: (taskId, priority) => client.updateTask(taskId, { priority }),
    confirm: (taskId, priority) => {
      confirmTaskPriority(queryClient, taskId, priority);
    },
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.threadLists() });
    },
  };
  const run = async (
    taskId: TaskId,
    priority: TaskPriority,
    previous: TaskPriority,
    undoable: boolean,
  ): Promise<void> => {
    const result = await writePriority(gateway, taskId, priority);
    if (result.kind === 'failed') {
      showToast(result.message);
      return;
    }
    if (result.kind !== 'saved' || !undoable) {
      return;
    }
    showToast(priorityTitle(priority), {
      undo: () => {
        void run(taskId, previous, priority, false);
      },
    });
  };
  return (thread, priority) => {
    const task = thread.activeTask;
    if (task == null) {
      return;
    }
    const previous = threadPriority(thread, usePendingPriorityStore.getState().pending);
    if (previous === priority) {
      return;
    }
    void run(task.id, priority, previous, true);
  };
};
