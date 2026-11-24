import { TASK_PRIORITIES, type TaskPriority } from '@relay/shared';
import { PRIORITY_GROUP_LABEL } from './priority-labels';

export interface PriorityGroup<T> {
  readonly priority: TaskPriority;
  readonly label: string;
  readonly items: T[];
}

export const groupByPriorityOf = <T>(
  items: readonly T[],
  priorityOf: (item: T) => TaskPriority,
): PriorityGroup<T>[] =>
  TASK_PRIORITIES.map((priority) => ({
    priority,
    label: PRIORITY_GROUP_LABEL[priority],
    items: items.filter((item) => priorityOf(item) === priority),
  })).filter((group) => group.items.length > 0);
