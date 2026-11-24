import {
  compareTaskPriority,
  DEFAULT_TASK_PRIORITY,
  type TaskPriority,
  type ThreadSummary,
} from '@relay/shared';
import type { ListItem } from '../mail/list-items';
import type { PendingPriorities } from './pending-priorities';

export type PriorityOf = (item: ListItem) => TaskPriority;

export const threadPriority = (
  thread: Pick<ThreadSummary, 'activeTask'>,
  pending: PendingPriorities,
): TaskPriority => {
  if (thread.activeTask == null) {
    return DEFAULT_TASK_PRIORITY;
  }
  return pending[thread.activeTask.id] ?? thread.activeTask.priority;
};

export const priorityOfItem =
  (pending: PendingPriorities): PriorityOf =>
  (item) => {
    if (item.kind !== 'thread') {
      return DEFAULT_TASK_PRIORITY;
    }
    return threadPriority(item.thread, pending);
  };

const lastMessageTime = (item: ListItem): number =>
  item.kind === 'thread' ? Date.parse(item.thread.lastMessageAt) : 0;

export const orderTaskItems = (items: readonly ListItem[], priorityOf: PriorityOf): ListItem[] =>
  [...items].sort(
    (left, right) =>
      compareTaskPriority(priorityOf(left), priorityOf(right)) ||
      lastMessageTime(right) - lastMessageTime(left) ||
      right.key.localeCompare(left.key),
  );
