import type { TaskSystemProvider } from '@relay/shared/domain';
import type { RemoteTaskList, TaskSystemAccess, TaskSystemAccount } from '../model/task-system';

export interface TaskSystemAdapter {
  readonly provider: TaskSystemProvider;
  verify(access: TaskSystemAccess): Promise<TaskSystemAccount>;
  listMyOpenTasks(access: TaskSystemAccess): Promise<RemoteTaskList>;
}
