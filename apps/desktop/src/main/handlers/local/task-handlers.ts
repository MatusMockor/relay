import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createTaskHandlers = (
  services: Pick<EngineServices, 'tasks'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.tasks.list': (query) => services.tasks.list(userId, query),
  'local.tasks.update': ({ taskId, patch }) => services.tasks.update(userId, taskId, patch),
});
