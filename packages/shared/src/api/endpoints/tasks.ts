import { z } from 'zod';
import { TaskIdSchema } from '../../domain/ids';
import { TaskSchema, TaskStateSchema } from '../../domain/task';
import { idParamsOf } from '../common';
import { defineEndpoint } from '../endpoint';
import { CursorPaginationQuerySchema, pageSchemaOf } from '../pagination';

export const TaskListQuerySchema = CursorPaginationQuerySchema.extend({
  state: TaskStateSchema.optional(),
});
export type TaskListQuery = z.infer<typeof TaskListQuerySchema>;

export const TaskPageSchema = pageSchemaOf(TaskSchema);
export type TaskPage = z.infer<typeof TaskPageSchema>;

export const UpdateTaskBodySchema = z.object({
  state: TaskStateSchema.optional(),
  title: z.string().trim().min(1).max(500).optional(),
});
export type UpdateTaskBody = z.infer<typeof UpdateTaskBodySchema>;

export const tasksEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/tasks',
    auth: 'user',
    query: TaskListQuerySchema,
    response: TaskPageSchema,
  }),
  update: defineEndpoint({
    method: 'PATCH',
    path: '/tasks/:id',
    auth: 'user',
    params: idParamsOf(TaskIdSchema),
    body: UpdateTaskBodySchema,
    response: TaskSchema,
  }),
};
