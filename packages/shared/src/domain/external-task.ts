import { z } from 'zod';
import { TaskSystemConnectionIdSchema } from './ids';
import { IsoDateTimeSchema } from './primitives';
import { TaskPrioritySchema } from './task-priority';
import { TaskSystemProviderSchema } from './task-system';

export const ExternalTaskStatusCategorySchema = z.enum(['todo', 'inProgress', 'done']);
export type ExternalTaskStatusCategory = z.infer<typeof ExternalTaskStatusCategorySchema>;

export const ExternalTaskStatusSchema = z.object({
  name: z.string().max(255),
  category: ExternalTaskStatusCategorySchema,
});
export type ExternalTaskStatus = z.infer<typeof ExternalTaskStatusSchema>;

export const ExternalTaskDueDateSchema = z.iso.date();

export const ExternalTaskSchema = z.object({
  connectionId: TaskSystemConnectionIdSchema,
  provider: TaskSystemProviderSchema,
  externalId: z.string().min(1).max(255),
  key: z.string().min(1).max(200),
  title: z.string().max(1000),
  url: z.url({ protocol: /^https?$/ }).max(4096),
  status: ExternalTaskStatusSchema,
  priority: TaskPrioritySchema,
  projectName: z.string().max(255).nullable(),
  dueDate: ExternalTaskDueDateSchema.nullable(),
  updatedAt: IsoDateTimeSchema,
});
export type ExternalTask = z.infer<typeof ExternalTaskSchema>;

export const ExternalTaskListSchema = z.object({
  items: z.array(ExternalTaskSchema),
  truncated: z.boolean(),
});
export type ExternalTaskList = z.infer<typeof ExternalTaskListSchema>;
