import type { TaskId, TaskPage, TaskPriority, ThreadPage } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../data/hooks/query-keys';

const writeTaskLists = (client: QueryClient, taskId: TaskId, priority: TaskPriority): void => {
  client.setQueriesData<TaskPage>({ queryKey: queryKeys.taskLists() }, (page) =>
    page === undefined
      ? page
      : {
          ...page,
          items: page.items.map((task) => (task.id === taskId ? { ...task, priority } : task)),
        },
  );
};

const writeThreadLists = (client: QueryClient, taskId: TaskId, priority: TaskPriority): void => {
  client.setQueriesData<ThreadPage>({ queryKey: queryKeys.threadLists() }, (page) =>
    page === undefined
      ? page
      : {
          ...page,
          items: page.items.map((thread) =>
            thread.activeTask?.id === taskId
              ? { ...thread, activeTask: { id: taskId, priority } }
              : thread,
          ),
        },
  );
};

export const confirmTaskPriority = (
  client: QueryClient,
  taskId: TaskId,
  priority: TaskPriority,
): void => {
  writeTaskLists(client, taskId, priority);
  writeThreadLists(client, taskId, priority);
};
