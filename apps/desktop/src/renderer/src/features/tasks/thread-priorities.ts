import {
  compareTaskPriority,
  DEFAULT_TASK_PRIORITY,
  type Task,
  type TaskPriority,
} from '@relay/shared';
import type { ListItem } from '../mail/list-items';

export type ThreadTaskIndex = ReadonlyMap<string, Task>;

export type PriorityOf = (item: ListItem) => TaskPriority;

const outranks = (candidate: Task, current: Task | undefined): boolean => {
  if (current === undefined) {
    return true;
  }
  if ((candidate.state === 'done') !== (current.state === 'done')) {
    return current.state === 'done';
  }
  return compareTaskPriority(candidate.priority, current.priority) < 0;
};

export const threadTaskIndex = (tasks: readonly Task[]): ThreadTaskIndex =>
  tasks.reduce((index, task) => {
    if (task.threadId === null || !outranks(task, index.get(task.threadId))) {
      return index;
    }
    index.set(task.threadId, task);
    return index;
  }, new Map<string, Task>());

export const priorityOfItem =
  (index: ThreadTaskIndex): PriorityOf =>
  (item) => {
    if (item.kind !== 'thread') {
      return DEFAULT_TASK_PRIORITY;
    }
    return index.get(item.thread.id)?.priority ?? DEFAULT_TASK_PRIORITY;
  };

export const orderByPriority = (items: readonly ListItem[], priorityOf: PriorityOf): ListItem[] =>
  items
    .map((item, position) => ({ item, position, priority: priorityOf(item) }))
    .sort(
      (left, right) =>
        compareTaskPriority(left.priority, right.priority) || left.position - right.position,
    )
    .map(({ item }) => item);
