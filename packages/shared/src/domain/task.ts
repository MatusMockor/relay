import { z } from 'zod';
import { TaskIdSchema, ThreadIdSchema, UserIdSchema } from './ids';
import { IsoDateTimeSchema, JiraKeySchema } from './primitives';

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
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Task = z.infer<typeof TaskSchema>;
