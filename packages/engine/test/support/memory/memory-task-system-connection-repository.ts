import type { TaskSystemConnectionId, UserId } from '@relay/shared/domain';
import type {
  TaskSystemAccountRef,
  TaskSystemConnectionRecord,
  TaskSystemConnectionRepository,
  TaskSystemStatusChange,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

const sameAccount = (record: TaskSystemConnectionRecord, account: TaskSystemAccountRef) =>
  record.provider === account.provider &&
  record.siteUrl === account.siteUrl &&
  record.externalAccountId === account.externalAccountId;

const byCreation = (left: TaskSystemConnectionRecord, right: TaskSystemConnectionRecord) =>
  left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);

export class MemoryTaskSystemConnectionRepository implements TaskSystemConnectionRepository {
  constructor(private readonly db: MemoryDatabase) {}

  list(userId: UserId): Promise<TaskSystemConnectionRecord[]> {
    return Promise.resolve(this.owned(userId).sort(byCreation));
  }

  findById(userId: UserId, id: TaskSystemConnectionId): Promise<TaskSystemConnectionRecord | null> {
    const record = this.db.tables.taskSystemConnections.get(id);
    return Promise.resolve(record?.userId === userId ? record : null);
  }

  findByAccount(
    userId: UserId,
    account: TaskSystemAccountRef,
  ): Promise<TaskSystemConnectionRecord | null> {
    const found = this.owned(userId).find((record) => sameAccount(record, account));
    return Promise.resolve(found ?? null);
  }

  save(record: TaskSystemConnectionRecord): Promise<TaskSystemConnectionRecord> {
    const existing = this.owned(record.userId).find((stored) => sameAccount(stored, record));
    const stored =
      existing === undefined
        ? record
        : { ...record, id: existing.id, createdAt: existing.createdAt };
    this.db.tables.taskSystemConnections.set(stored.id, stored);
    return Promise.resolve(stored);
  }

  async recordStatus(
    userId: UserId,
    id: TaskSystemConnectionId,
    change: TaskSystemStatusChange,
  ): Promise<TaskSystemConnectionRecord | null> {
    const record = await this.findById(userId, id);
    if (record === null) {
      return null;
    }
    const updated = { ...record, ...change };
    this.db.tables.taskSystemConnections.set(id, updated);
    return updated;
  }

  async delete(userId: UserId, id: TaskSystemConnectionId): Promise<boolean> {
    const record = await this.findById(userId, id);
    return record !== null && this.db.tables.taskSystemConnections.delete(id);
  }

  private owned(userId: UserId): TaskSystemConnectionRecord[] {
    return [...this.db.tables.taskSystemConnections.values()].filter(
      (record) => record.userId === userId,
    );
  }
}
