import type { TaskSystemSecretStore } from '@relay/engine';
import {
  type TaskSystemConnectionId,
  type TaskSystemCredentials,
  TaskSystemCredentialsSchema,
} from '@relay/shared/domain';
import { parseJsonOrNull } from '../storage/parse-json';
import type { SecretStore } from './secret-store';

export class SecretStoreTaskSystemSecrets implements TaskSystemSecretStore {
  constructor(private readonly store: SecretStore) {}

  async get(connectionId: TaskSystemConnectionId): Promise<TaskSystemCredentials | null> {
    const raw = await this.store.get(connectionId);
    if (raw === null) {
      return null;
    }
    const parsed = TaskSystemCredentialsSchema.safeParse(parseJsonOrNull(raw));
    return parsed.success ? parsed.data : null;
  }

  set(connectionId: TaskSystemConnectionId, credentials: TaskSystemCredentials): Promise<void> {
    return this.store.set(
      connectionId,
      JSON.stringify(TaskSystemCredentialsSchema.parse(credentials)),
    );
  }

  delete(connectionId: TaskSystemConnectionId): Promise<void> {
    return this.store.delete(connectionId);
  }
}
