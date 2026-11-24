import type { TaskSystemConnectionId, TaskSystemCredentials } from '@relay/shared/domain';

export interface TaskSystemSecretStore {
  get(connectionId: TaskSystemConnectionId): Promise<TaskSystemCredentials | null>;
  set(connectionId: TaskSystemConnectionId, credentials: TaskSystemCredentials): Promise<void>;
  delete(connectionId: TaskSystemConnectionId): Promise<void>;
}
