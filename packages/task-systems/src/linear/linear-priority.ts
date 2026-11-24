import type { TaskPriority } from '@relay/shared/domain';

const BY_LEVEL: ReadonlyMap<number, TaskPriority> = new Map([
  [1, 'urgent'],
  [2, 'high'],
  [3, 'medium'],
  [4, 'low'],
]);

export const linearPriorityOf = (priority: number | null | undefined): TaskPriority =>
  BY_LEVEL.get(priority ?? 0) ?? 'none';
