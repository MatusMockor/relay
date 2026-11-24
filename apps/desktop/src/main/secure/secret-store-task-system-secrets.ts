import type { TaskSystemSecretStore } from '@relay/engine';
import {
  type TaskSystemConnectionId,
  type TaskSystemCredentials,
  TaskSystemCredentialsSchema,
  type UserId,
} from '@relay/shared/domain';
import { parseJsonOrNull } from '../storage/parse-json';
import type { SecretStore } from './secret-store';

const keyOf = (userId: UserId, connectionId: TaskSystemConnectionId): string =>
  `${userId}/${connectionId}`;

export class SecretStoreTaskSystemSecrets implements TaskSystemSecretStore {
  constructor(private readonly store: SecretStore) {}

  async get(
    userId: UserId,
    connectionId: TaskSystemConnectionId,
  ): Promise<TaskSystemCredentials | null> {
    const raw = await this.store.get(keyOf(userId, connectionId));
    if (raw === null) {
      return null;
    }
    const parsed = TaskSystemCredentialsSchema.safeParse(parseJsonOrNull(raw));
    return parsed.success ? parsed.data : null;
  }

  set(
    userId: UserId,
    connectionId: TaskSystemConnectionId,
    credentials: TaskSystemCredentials,
  ): Promise<void> {
    return this.store.set(
      keyOf(userId, connectionId),
      JSON.stringify(TaskSystemCredentialsSchema.parse(credentials)),
    );
  }

  delete(userId: UserId, connectionId: TaskSystemConnectionId): Promise<void> {
    return this.store.delete(keyOf(userId, connectionId));
  }
}
