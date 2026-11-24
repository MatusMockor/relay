import { api } from '@relay/shared';
import type { TaskSystemClient } from '../TaskSystemClient';
import type { HttpApi } from './HttpApi';

export const createRemoteTaskSystemClient = (http: HttpApi): TaskSystemClient => ({
  listTaskSystems: () => http.call(api.taskSystems.list, {}),
  connectTaskSystem: (body) => http.call(api.taskSystems.connect, { body }),
  disconnectTaskSystem: async (id) => {
    await http.call(api.taskSystems.disconnect, { params: { id } });
  },
  listTaskSystemTasks: (id) => http.call(api.taskSystems.tasks, { params: { id } }),
});
