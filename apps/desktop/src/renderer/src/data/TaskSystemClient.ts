import type {
  ConnectTaskSystemInput,
  ExternalTaskList,
  TaskSystemConnection,
  TaskSystemConnectionId,
} from '@relay/shared';

export interface TaskSystemClient {
  listTaskSystems(): Promise<TaskSystemConnection[]>;
  connectTaskSystem(input: ConnectTaskSystemInput): Promise<TaskSystemConnection>;
  disconnectTaskSystem(connectionId: TaskSystemConnectionId): Promise<void>;
  listTaskSystemTasks(connectionId: TaskSystemConnectionId): Promise<ExternalTaskList>;
}
