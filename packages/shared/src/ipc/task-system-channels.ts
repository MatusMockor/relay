import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import { TaskSystemConnectionListSchema } from '../api/endpoints/task-systems';
import { ExternalTaskListSchema } from '../domain/external-task';
import { TaskSystemConnectionIdSchema } from '../domain/ids';
import { ConnectTaskSystemInputSchema, TaskSystemConnectionSchema } from '../domain/task-system';
import { invokeChannel } from './define';

const connectionRef = z.object({ connectionId: TaskSystemConnectionIdSchema });

export const taskSystemInvokeChannels = {
  'local.taskSystems.list': invokeChannel(z.undefined(), TaskSystemConnectionListSchema),
  'local.taskSystems.connect': invokeChannel(
    ConnectTaskSystemInputSchema,
    TaskSystemConnectionSchema,
  ),
  'local.taskSystems.disconnect': invokeChannel(connectionRef, OkResponseSchema),
  'local.taskSystems.tasks': invokeChannel(connectionRef, ExternalTaskListSchema),
};
