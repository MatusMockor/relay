import type {
  ConnectTaskSystemInput,
  TaskSystemConnection,
  TaskSystemConnectionId,
  TaskSystemCredentials,
  UserId,
} from '@relay/shared/domain';
import type { TaskSystemAccount, TaskSystemConnectionRecord } from '../../model/task-system';
import type { IdGenerator } from '../../ports/id-generator';
import { connectRequestOf, defaultLabelOf } from './connect-request';
import { adapterFor, ownedConnection, type TaskSystemServiceDeps } from './task-system-deps';
import { MISSING_SECRET_MESSAGE, toTaskSystemError } from './task-system-errors';
import { toTaskSystemConnection } from './task-system-view';

export interface TaskSystemConnectorDeps extends TaskSystemServiceDeps {
  readonly ids: IdGenerator;
}

interface Verified {
  readonly userId: UserId;
  readonly input: ConnectTaskSystemInput;
  readonly account: TaskSystemAccount;
  readonly label: string | null;
  readonly credentials: TaskSystemCredentials;
}

export class TaskSystemConnector {
  constructor(private readonly deps: TaskSystemConnectorDeps) {}

  async connect(userId: UserId, input: ConnectTaskSystemInput): Promise<TaskSystemConnection> {
    const adapter = adapterFor(this.deps.adapters, input.provider);
    const request = connectRequestOf(input);
    const account = await adapter.verify(request.access).catch((error: unknown) => {
      throw toTaskSystemError(error);
    });
    const verified: Verified = {
      userId,
      input,
      account,
      label: request.label,
      credentials: account.credentials ?? request.access.credentials,
    };
    const existing = await this.deps.connections.findByAccount(userId, {
      provider: input.provider,
      siteUrl: account.siteUrl,
      externalAccountId: account.externalAccountId,
    });
    const target = existing ?? (await this.placeholder(verified));
    await this.storeSecret(verified, target, existing === null);
    const saved = await this.deps.connections.save(this.recordOf(verified, target, 'ok'));
    await this.deps.events.emit(userId, 'taskSystems.updated', { connectionId: saved.id });
    return toTaskSystemConnection(saved);
  }

  async disconnect(userId: UserId, id: TaskSystemConnectionId): Promise<void> {
    const record = await ownedConnection(this.deps.connections, userId, id);
    await this.deps.connections.delete(userId, record.id);
    await this.deps.adapters.secrets.delete(userId, record.id);
    await this.deps.events.emit(userId, 'taskSystems.updated', { connectionId: record.id });
  }

  private placeholder(verified: Verified): Promise<TaskSystemConnectionRecord> {
    return this.deps.connections.save(this.recordOf(verified, null, 'error'));
  }

  private async storeSecret(
    verified: Verified,
    target: TaskSystemConnectionRecord,
    created: boolean,
  ): Promise<void> {
    try {
      await this.deps.adapters.secrets.set(verified.userId, target.id, verified.credentials);
    } catch (error) {
      if (created) {
        await this.deps.connections.delete(verified.userId, target.id);
      }
      throw error;
    }
  }

  private recordOf(
    verified: Verified,
    existing: TaskSystemConnectionRecord | null,
    status: 'ok' | 'error',
  ): TaskSystemConnectionRecord {
    const { userId, input, account, label } = verified;
    const now = this.deps.clock.now().toISOString();
    return {
      id: existing?.id ?? this.deps.ids.generate('taskSystemConnection'),
      userId,
      provider: input.provider,
      label: label ?? existing?.label ?? defaultLabelOf(account),
      siteUrl: account.siteUrl,
      accountName: account.accountName.slice(0, 255),
      externalAccountId: account.externalAccountId,
      status,
      lastError: status === 'ok' ? null : MISSING_SECRET_MESSAGE,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }
}
