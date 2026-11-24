import { z } from 'zod';

export const TASK_PRIORITIES = ['urgent', 'high', 'medium', 'low', 'none'] as const;

export const TaskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const DEFAULT_TASK_PRIORITY: TaskPriority = 'none';

export const taskPriorityRank = (priority: TaskPriority): number =>
  TASK_PRIORITIES.indexOf(priority);

export const compareTaskPriority = (left: TaskPriority, right: TaskPriority): number =>
  taskPriorityRank(left) - taskPriorityRank(right);
