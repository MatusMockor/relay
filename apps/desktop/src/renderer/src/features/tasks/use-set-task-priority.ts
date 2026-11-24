import type { Task, TaskPriority, ThreadSummary } from '@relay/shared';
import { useQueryClient } from '@tanstack/react-query';
import { describeError } from '../../data/errors';
import { queryKeys } from '../../data/hooks/query-keys';
import { useClient } from '../../data/hooks/services-context';
import { showToast } from '../../state/toast-store';
import { priorityTitle } from './priority-labels';
import { writeTaskPriority } from './task-priority-cache';
import { useThreadTaskIndex } from './use-thread-task-index';

export type SetThreadPriority = (thread: ThreadSummary, priority: TaskPriority) => void;

export const useSetTaskPriority = (): SetThreadPriority => {
  const client = useClient();
  const queryClient = useQueryClient();
  const index = useThreadTaskIndex();
  const apply = async (task: Task, priority: TaskPriority): Promise<void> => {
    await queryClient.cancelQueries({ queryKey: queryKeys.taskLists() });
    writeTaskPriority(queryClient, task.id, priority);
    try {
      await client.updateTask(task.id, { priority });
    } catch (error: unknown) {
      writeTaskPriority(queryClient, task.id, task.priority);
      showToast(describeError(error));
    }
    void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists() });
  };
  return (thread, priority) => {
    const task = index.get(thread.id);
    if (task === undefined || task.priority === priority) {
      return;
    }
    void apply(task, priority);
    showToast(priorityTitle(priority), {
      undo: () => {
        void apply({ ...task, priority }, task.priority);
      },
    });
  };
};
