import type {
  TaskSystemAccountRef,
  TaskSystemConnectionRecord,
  TaskSystemConnectionRepository,
  TaskSystemStatusChange,
} from '@relay/engine';
import type { TaskSystemConnectionId, UserId } from '@relay/shared/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import {
  toTaskSystemConnectionRecord,
  toTaskSystemConnectionRow,
} from '../mappers/task-system-mapper';
import { taskSystemConnections as connections } from '../schema';

const owned = (userId: UserId, id: TaskSystemConnectionId) =>
  and(eq(connections.userId, userId), eq(connections.id, id));

export class SqliteTaskSystemConnectionRepository implements TaskSystemConnectionRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  list(userId: UserId): Promise<TaskSystemConnectionRecord[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(connections)
        .where(eq(connections.userId, userId))
        .orderBy(asc(connections.createdAt), asc(connections.id))
        .all()
        .map(toTaskSystemConnectionRecord),
    );
  }

  findById(userId: UserId, id: TaskSystemConnectionId): Promise<TaskSystemConnectionRecord | null> {
    return this.executor.execute((db) => {
      const row = db.select().from(connections).where(owned(userId, id)).get();
      return row === undefined ? null : toTaskSystemConnectionRecord(row);
    });
  }

  findByAccount(
    userId: UserId,
    account: TaskSystemAccountRef,
  ): Promise<TaskSystemConnectionRecord | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(connections)
        .where(
          and(
            eq(connections.userId, userId),
            eq(connections.provider, account.provider),
            eq(connections.siteUrl, account.siteUrl),
            eq(connections.externalAccountId, account.externalAccountId),
          ),
        )
        .get();
      return row === undefined ? null : toTaskSystemConnectionRecord(row);
    });
  }

  save(record: TaskSystemConnectionRecord): Promise<TaskSystemConnectionRecord> {
    return this.executor.execute((db) => {
      const row = toTaskSystemConnectionRow(record);
      const { id: _id, userId: _userId, createdAt: _createdAt, ...changes } = row;
      return toTaskSystemConnectionRecord(
        db
          .insert(connections)
          .values(row)
          .onConflictDoUpdate({ target: connections.id, set: changes })
          .returning()
          .get(),
      );
    });
  }

  recordStatus(
    userId: UserId,
    id: TaskSystemConnectionId,
    change: TaskSystemStatusChange,
  ): Promise<TaskSystemConnectionRecord | null> {
    return this.executor.execute((db) => {
      const [row] = db.update(connections).set(change).where(owned(userId, id)).returning().all();
      return row === undefined ? null : toTaskSystemConnectionRecord(row);
    });
  }

  delete(userId: UserId, id: TaskSystemConnectionId): Promise<boolean> {
    return this.executor.execute(
      (db) => db.delete(connections).where(owned(userId, id)).run().changes > 0,
    );
  }
}
