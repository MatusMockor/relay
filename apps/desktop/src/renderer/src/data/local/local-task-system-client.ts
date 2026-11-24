import type { IpcResult, RelayBridge } from '@relay/shared';
import { MailClientError } from '../errors';
import type { TaskSystemClient } from '../TaskSystemClient';

const unwrap = async <T>(result: Promise<IpcResult<T>>): Promise<T> => {
  const settled = await result;
  if (!settled.ok) {
    throw new MailClientError(settled.error);
  }
  return settled.data;
};

export const createLocalTaskSystemClient = (bridge: RelayBridge): TaskSystemClient => ({
  listTaskSystems: () => unwrap(bridge.invoke('local.taskSystems.list')),
  connectTaskSystem: (input) => unwrap(bridge.invoke('local.taskSystems.connect', input)),
  disconnectTaskSystem: async (connectionId) => {
    await unwrap(bridge.invoke('local.taskSystems.disconnect', { connectionId }));
  },
  listTaskSystemTasks: (connectionId) =>
    unwrap(bridge.invoke('local.taskSystems.tasks', { connectionId })),
});
