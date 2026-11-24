import { compareTaskPriority, DEFAULT_TASK_PRIORITY, TASK_PRIORITIES } from './task-priority';
import type { Task } from './task';
import type { ThreadActiveTask, ThreadSummary } from './thread';

const byActiveOrder = (left: Task, right: Task): number =>
  compareTaskPriority(left.priority, right.priority) ||
  Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
  right.id.localeCompare(left.id);

export const activeTaskOf = (
  tasks: readonly Task[],
  thread: Pick<ThreadSummary, 'id'>,
): ThreadActiveTask | null => {
  const [best] = tasks
    .filter((task) => task.threadId === thread.id && task.state !== 'done')
    .sort(byActiveOrder);
  return best === undefined ? null : { id: best.id, priority: best.priority };
};

export const activeTaskRank = (thread: Pick<ThreadSummary, 'activeTask'>): number =>
  thread.activeTask == null
    ? TASK_PRIORITIES.length
    : TASK_PRIORITIES.indexOf(thread.activeTask.priority);

export const activeTaskPriority = (thread: Pick<ThreadSummary, 'activeTask'>) =>
  thread.activeTask?.priority ?? DEFAULT_TASK_PRIORITY;

export const compareTaskThreads = (left: ThreadSummary, right: ThreadSummary): number =>
  activeTaskRank(left) - activeTaskRank(right) ||
  Date.parse(right.lastMessageAt) - Date.parse(left.lastMessageAt) ||
  right.id.localeCompare(left.id);
