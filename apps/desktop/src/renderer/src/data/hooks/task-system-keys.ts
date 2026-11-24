import type { TaskSystemConnectionId } from '@relay/shared';

export const taskSystemKeys = {
  all: () => ['mail', 'task-systems'] as const,
  connections: () => ['mail', 'task-systems', 'connections'] as const,
  tasks: (connectionId: TaskSystemConnectionId) =>
    ['mail', 'task-systems', 'tasks', connectionId] as const,
};
