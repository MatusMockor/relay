import type { TaskSystemConnectionId, TaskSystemCredentials, UserId } from '@relay/shared/domain';

export interface TaskSystemSecretStore {
  get(userId: UserId, connectionId: TaskSystemConnectionId): Promise<TaskSystemCredentials | null>;
  set(
    userId: UserId,
    connectionId: TaskSystemConnectionId,
    credentials: TaskSystemCredentials,
  ): Promise<void>;
  delete(userId: UserId, connectionId: TaskSystemConnectionId): Promise<void>;
}
