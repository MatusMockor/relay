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
import { toTaskSystemError } from './task-system-errors';
import { toTaskSystemConnection } from './task-system-view';

export interface TaskSystemConnectorDeps extends TaskSystemServiceDeps {
  readonly ids: IdGenerator;
}

export class TaskSystemConnector {
  constructor(private readonly deps: TaskSystemConnectorDeps) {}

  async connect(userId: UserId, input: ConnectTaskSystemInput): Promise<TaskSystemConnection> {
    const { connections, adapters } = this.deps;
    const adapter = adapterFor(adapters, input.provider);
    const request = connectRequestOf(input);
    const account = await adapter.verify(request.access).catch((error: unknown) => {
      throw toTaskSystemError(error);
    });
    const existing = await connections.findByAccount(userId, {
      provider: input.provider,
      siteUrl: account.siteUrl,
      externalAccountId: account.externalAccountId,
    });
    const saved = await connections.save(
      this.recordOf(userId, input, account, request.label, existing),
    );
    await this.storeSecret(userId, saved, existing === null, request.access.credentials);
    await this.deps.events.emit(userId, 'taskSystems.updated', { connectionId: saved.id });
    return toTaskSystemConnection(saved);
  }

  async disconnect(userId: UserId, id: TaskSystemConnectionId): Promise<void> {
    const record = await ownedConnection(this.deps.connections, userId, id);
    await this.deps.adapters.secrets.delete(record.id);
    await this.deps.connections.delete(userId, record.id);
    await this.deps.events.emit(userId, 'taskSystems.updated', { connectionId: record.id });
  }

  private recordOf(
    userId: UserId,
    input: ConnectTaskSystemInput,
    account: TaskSystemAccount,
    label: string | null,
    existing: TaskSystemConnectionRecord | null,
  ): TaskSystemConnectionRecord {
    const now = this.deps.clock.now().toISOString();
    return {
      id: existing?.id ?? this.deps.ids.generate('taskSystemConnection'),
      userId,
      provider: input.provider,
      label: label ?? existing?.label ?? defaultLabelOf(account.siteUrl),
      siteUrl: account.siteUrl,
      accountName: account.accountName.slice(0, 255),
      externalAccountId: account.externalAccountId,
      status: 'ok',
      lastError: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
  }

  private async storeSecret(
    userId: UserId,
    record: TaskSystemConnectionRecord,
    created: boolean,
    credentials: TaskSystemCredentials,
  ): Promise<void> {
    try {
      await this.deps.adapters.secrets.set(record.id, credentials);
    } catch (error) {
      if (created) {
        await this.deps.connections.delete(userId, record.id);
      }
      throw error;
    }
  }
}
