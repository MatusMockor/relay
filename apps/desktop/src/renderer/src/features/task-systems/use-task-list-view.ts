import type { ExternalTaskList, TaskSystemConnection, TaskSystemConnectionId } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import { taskSystemKeys } from '../../data/hooks/task-system-keys';
import { useTaskSystemConnection, useTaskSystemTasks } from '../../data/hooks/use-task-systems';
import { type TaskListView, taskListViewOf } from './task-list-view';

export const useTaskListView = (connectionId: TaskSystemConnectionId) => {
  const connection = useTaskSystemConnection(connectionId);
  const tasks = useTaskSystemTasks(connectionId);
  const view = taskListViewOf(connection, {
    data: tasks.data,
    error: tasks.error,
    pending: tasks.isPending,
  });
  return { connection, view, refetch: tasks.refetch };
};

export const cachedTaskListView = (
  queryClient: QueryClient,
  connectionId: TaskSystemConnectionId,
): TaskListView => {
  const connection = queryClient
    .getQueryData<TaskSystemConnection[]>(taskSystemKeys.connections())
    ?.find((item) => item.id === connectionId);
  const state = queryClient.getQueryState<ExternalTaskList>(taskSystemKeys.tasks(connectionId));
  return taskListViewOf(connection, {
    data: state?.data,
    error: state?.error ?? null,
    pending: state === undefined || state.status === 'pending',
  });
};
