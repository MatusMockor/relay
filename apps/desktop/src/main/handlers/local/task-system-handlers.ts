import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createTaskSystemHandlers = (
  services: Pick<EngineServices, 'taskSystems'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.taskSystems.list': () => services.taskSystems.list(userId),
  'local.taskSystems.connect': (input) => services.taskSystems.connect(userId, input),
  'local.taskSystems.disconnect': async ({ connectionId }) => {
    await services.taskSystems.disconnect(userId, connectionId);
    return { ok: true };
  },
  'local.taskSystems.tasks': ({ connectionId }) =>
    services.taskSystems.listTasks(userId, connectionId),
});
