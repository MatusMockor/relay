import type { ExternalTaskList, TaskSystemConnectionId, UserId } from '@relay/shared/domain';
import { ForbiddenError } from '../../errors/errors';
import type { RemoteTaskList, TaskSystemConnectionRecord } from '../../model/task-system';
import { adapterFor, ownedConnection, type TaskSystemServiceDeps } from './task-system-deps';
import { isAuthFailure, MISSING_SECRET_MESSAGE, toTaskSystemError } from './task-system-errors';

const listOf = (record: TaskSystemConnectionRecord, remote: RemoteTaskList): ExternalTaskList => ({
  items: remote.tasks.map((task) => ({
    ...task,
    connectionId: record.id,
    provider: record.provider,
  })),
  truncated: remote.truncated,
});

export class TaskSystemTaskReader {
  constructor(private readonly deps: TaskSystemServiceDeps) {}

  async list(userId: UserId, id: TaskSystemConnectionId): Promise<ExternalTaskList> {
    const record = await ownedConnection(this.deps.connections, userId, id);
    const adapter = adapterFor(this.deps.adapters, record.provider);
    const credentials = await this.deps.adapters.secrets.get(record.id);
    if (credentials === null) {
      await this.markStatus(record, MISSING_SECRET_MESSAGE);
      throw new ForbiddenError(MISSING_SECRET_MESSAGE);
    }
    try {
      const remote = await adapter.listMyOpenTasks({ siteUrl: record.siteUrl, credentials });
      await this.markStatus(record, null);
      return listOf(record, remote);
    } catch (error) {
      if (isAuthFailure(error)) {
        await this.markStatus(record, error.message);
      }
      throw toTaskSystemError(error);
    }
  }

  private async markStatus(
    record: TaskSystemConnectionRecord,
    lastError: string | null,
  ): Promise<void> {
    const status = lastError === null ? 'ok' : 'error';
    if (record.status === status && record.lastError === lastError) {
      return;
    }
    const updated = await this.deps.connections.recordStatus(record.userId, record.id, {
      status,
      lastError,
      updatedAt: this.deps.clock.now().toISOString(),
    });
    if (updated === null) {
      return;
    }
    await this.deps.events.emit(record.userId, 'taskSystems.updated', { connectionId: record.id });
  }
}
