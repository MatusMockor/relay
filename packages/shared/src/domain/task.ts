import { z } from 'zod';
import { TaskIdSchema, ThreadIdSchema, UserIdSchema } from './ids';
import { IsoDateTimeSchema, JiraKeySchema } from './primitives';
import { DEFAULT_TASK_PRIORITY, TaskPrioritySchema } from './task-priority';

export const TaskStateSchema = z.enum(['open', 'waiting', 'done']);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const TaskSourceSchema = z.enum(['jira', 'ai', 'manual']);
export type TaskSource = z.infer<typeof TaskSourceSchema>;

export const TaskSchema = z.object({
  id: TaskIdSchema,
  userId: UserIdSchema,
  threadId: ThreadIdSchema.nullable(),
  jiraKey: JiraKeySchema.nullable(),
  title: z.string().min(1).max(500),
  aiWhat: z.string().nullable(),
  state: TaskStateSchema,
  source: TaskSourceSchema,
  priority: TaskPrioritySchema.default(DEFAULT_TASK_PRIORITY),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Task = z.infer<typeof TaskSchema>;
