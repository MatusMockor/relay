import type { TaskSystemSecretStore } from '@relay/engine';
import {
  type TaskSystemConnectionId,
  type TaskSystemCredentials,
  TaskSystemCredentialsSchema,
  type UserId,
} from '@relay/shared/domain';
import type { AesGcmCipher } from './aes-gcm-cipher';
import { CredentialDecryptionError } from './credential-decryption-error';
import type { PgTaskSystemSecretStore } from './pg-task-system-secret-store';

const associatedDataFor = (userId: UserId, connectionId: TaskSystemConnectionId): string =>
  `relay:task-system:${userId}:${connectionId}`;

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export class AesGcmTaskSystemSecrets implements TaskSystemSecretStore {
  constructor(
    private readonly store: PgTaskSystemSecretStore,
    private readonly cipher: AesGcmCipher,
  ) {}

  async get(
    userId: UserId,
    connectionId: TaskSystemConnectionId,
  ): Promise<TaskSystemCredentials | null> {
    const envelope = await this.store.find(userId, connectionId);
    if (envelope === null) {
      return null;
    }
    const plaintext = this.cipher.decrypt(envelope, associatedDataFor(userId, connectionId));
    const parsed = TaskSystemCredentialsSchema.safeParse(parseJson(plaintext));
    if (!parsed.success) {
      throw new CredentialDecryptionError('Decrypted task system credentials are invalid');
    }
    return parsed.data;
  }

  async set(
    userId: UserId,
    connectionId: TaskSystemConnectionId,
    credentials: TaskSystemCredentials,
  ): Promise<void> {
    const serialized = JSON.stringify(TaskSystemCredentialsSchema.parse(credentials));
    const stored = await this.store.save(
      userId,
      connectionId,
      this.cipher.encrypt(serialized, associatedDataFor(userId, connectionId)),
    );
    if (!stored) {
      throw new Error(`Task system connection ${connectionId} does not exist`);
    }
  }

  async delete(userId: UserId, connectionId: TaskSystemConnectionId): Promise<void> {
    await this.store.save(userId, connectionId, null);
  }
}
