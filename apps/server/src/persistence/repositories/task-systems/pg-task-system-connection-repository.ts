import type {
  TaskSystemAccountRef,
  TaskSystemConnectionRecord,
  TaskSystemConnectionRepository,
  TaskSystemStatusChange,
} from '@relay/engine';
import type { TaskSystemConnectionId, UserId } from '@relay/shared/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { taskSystemConnections as connections } from '../../schema';
import { toDate } from '../../support/timestamps';
import {
  toTaskSystemConnectionInsert,
  toTaskSystemConnectionRecord,
} from './task-system-connection.mapper';

const ACCOUNT_KEY = [
  connections.userId,
  connections.provider,
  connections.siteUrl,
  connections.externalAccountId,
];

const owned = (userId: UserId, id: TaskSystemConnectionId) =>
  and(eq(connections.userId, userId), eq(connections.id, id));

const PUBLIC_COLUMNS = {
  id: connections.id,
  userId: connections.userId,
  provider: connections.provider,
  label: connections.label,
  siteUrl: connections.siteUrl,
  accountName: connections.accountName,
  externalAccountId: connections.externalAccountId,
  status: connections.status,
  lastError: connections.lastError,
  createdAt: connections.createdAt,
  updatedAt: connections.updatedAt,
};

export class PgTaskSystemConnectionRepository implements TaskSystemConnectionRepository {
  constructor(private readonly db: DbExecutor) {}

  async list(userId: UserId): Promise<TaskSystemConnectionRecord[]> {
    const rows = await this.db
      .select(PUBLIC_COLUMNS)
      .from(connections)
      .where(eq(connections.userId, userId))
      .orderBy(asc(connections.createdAt), asc(connections.id));
    return rows.map(toTaskSystemConnectionRecord);
  }

  async findById(
    userId: UserId,
    id: TaskSystemConnectionId,
  ): Promise<TaskSystemConnectionRecord | null> {
    const [row] = await this.db.select(PUBLIC_COLUMNS).from(connections).where(owned(userId, id));
    return row === undefined ? null : toTaskSystemConnectionRecord(row);
  }

  async findByAccount(
    userId: UserId,
    account: TaskSystemAccountRef,
  ): Promise<TaskSystemConnectionRecord | null> {
    const [row] = await this.db
      .select(PUBLIC_COLUMNS)
      .from(connections)
      .where(
        and(
          eq(connections.userId, userId),
          eq(connections.provider, account.provider),
          eq(connections.siteUrl, account.siteUrl),
          eq(connections.externalAccountId, account.externalAccountId),
        ),
      );
    return row === undefined ? null : toTaskSystemConnectionRecord(row);
  }

  async save(record: TaskSystemConnectionRecord): Promise<TaskSystemConnectionRecord> {
    const values = toTaskSystemConnectionInsert(record);
    const { id: _id, userId: _userId, createdAt: _createdAt, ...changes } = values;
    const [row] = await this.db
      .insert(connections)
      .values(values)
      .onConflictDoUpdate({ target: ACCOUNT_KEY, set: changes })
      .returning(PUBLIC_COLUMNS);
    if (row === undefined) {
      throw new Error(`Task system connection ${record.id} was not stored`);
    }
    return toTaskSystemConnectionRecord(row);
  }

  async recordStatus(
    userId: UserId,
    id: TaskSystemConnectionId,
    change: TaskSystemStatusChange,
  ): Promise<TaskSystemConnectionRecord | null> {
    const [row] = await this.db
      .update(connections)
      .set({
        status: change.status,
        lastError: change.lastError,
        updatedAt: toDate(change.updatedAt),
      })
      .where(owned(userId, id))
      .returning(PUBLIC_COLUMNS);
    return row === undefined ? null : toTaskSystemConnectionRecord(row);
  }

  async delete(userId: UserId, id: TaskSystemConnectionId): Promise<boolean> {
    const rows = await this.db
      .delete(connections)
      .where(owned(userId, id))
      .returning({ id: connections.id });
    return rows.length > 0;
  }
}
