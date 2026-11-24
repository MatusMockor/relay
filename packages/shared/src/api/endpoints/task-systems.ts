import { ExternalTaskListSchema } from '../../domain/external-task';
import { TaskSystemConnectionIdSchema } from '../../domain/ids';
import { ConnectTaskSystemInputSchema, TaskSystemConnectionSchema } from '../../domain/task-system';
import { z } from 'zod';
import { idParamsOf, OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';

const connectionParams = idParamsOf(TaskSystemConnectionIdSchema);

export const TaskSystemConnectionListSchema = z.array(TaskSystemConnectionSchema);

export const taskSystemsEndpoints = {
  list: defineEndpoint({
    method: 'GET',
    path: '/task-systems/connections',
    auth: 'user',
    response: TaskSystemConnectionListSchema,
  }),
  connect: defineEndpoint({
    method: 'POST',
    path: '/task-systems/connections',
    auth: 'user',
    body: ConnectTaskSystemInputSchema,
    response: TaskSystemConnectionSchema,
  }),
  disconnect: defineEndpoint({
    method: 'DELETE',
    path: '/task-systems/connections/:id',
    auth: 'user',
    params: connectionParams,
    response: OkResponseSchema,
  }),
  tasks: defineEndpoint({
    method: 'GET',
    path: '/task-systems/connections/:id/tasks',
    auth: 'user',
    params: connectionParams,
    response: ExternalTaskListSchema,
  }),
};
