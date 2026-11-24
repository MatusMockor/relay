import type { TaskId, TaskPage, TaskPriority } from '@relay/shared';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../data/hooks/query-keys';

export const writeTaskPriority = (
  client: QueryClient,
  taskId: TaskId,
  priority: TaskPriority,
): void => {
  client.setQueriesData<TaskPage>({ queryKey: queryKeys.taskLists() }, (page) =>
    page === undefined
      ? page
      : {
          ...page,
          items: page.items.map((task) => (task.id === taskId ? { ...task, priority } : task)),
        },
  );
};
