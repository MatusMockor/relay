import type {
  GoogleConnectionRecord,
  GoogleConnectionRepository,
  GoogleConnectionStatusChange,
} from '@relay/engine';
import type { CalendarConnectionId, UserId } from '@relay/shared/domain';
import { and, asc, eq, isNull, lt, ne, or } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toConnectionRecord, toConnectionRow } from '../mappers/google-calendar-mapper';
import { googleCalendarConnections as connections } from '../schema';

const owned = (userId: UserId, id: CalendarConnectionId) =>
  and(eq(connections.userId, userId), eq(connections.id, id));

export class SqliteGoogleConnectionRepository implements GoogleConnectionRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  list(userId: UserId): Promise<GoogleConnectionRecord[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(connections)
        .where(eq(connections.userId, userId))
        .orderBy(asc(connections.createdAt), asc(connections.id))
        .all()
        .map(toConnectionRecord),
    );
  }

  findById(userId: UserId, id: CalendarConnectionId): Promise<GoogleConnectionRecord | null> {
    return this.executor.execute((db) => {
      const row = db.select().from(connections).where(owned(userId, id)).get();
      return row === undefined ? null : toConnectionRecord(row);
    });
  }

  findByEmail(userId: UserId, email: string): Promise<GoogleConnectionRecord | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(connections)
        .where(and(eq(connections.userId, userId), eq(connections.email, email)))
        .get();
      return row === undefined ? null : toConnectionRecord(row);
    });
  }

  save(record: GoogleConnectionRecord): Promise<GoogleConnectionRecord> {
    return this.executor.execute((db) => {
      const { id: _id, createdAt: _createdAt, ...changes } = toConnectionRow(record);
      return toConnectionRecord(
        db
          .insert(connections)
          .values(toConnectionRow(record))
          .onConflictDoUpdate({ target: connections.id, set: changes })
          .returning()
          .get(),
      );
    });
  }

  delete(userId: UserId, id: CalendarConnectionId): Promise<boolean> {
    return this.executor.execute(
      (db) => db.delete(connections).where(owned(userId, id)).run().changes > 0,
    );
  }

  recordSync(id: CalendarConnectionId, change: GoogleConnectionStatusChange): Promise<void> {
    return this.executor.execute((db) => {
      db.update(connections)
        .set({
          status: change.status,
          lastError: change.lastError,
          lastAttemptAt: change.attemptedAt,
          lastAttemptTs: Date.parse(change.attemptedAt),
          ...(change.syncedAt === null ? {} : { lastSyncedAt: change.syncedAt }),
        })
        .where(eq(connections.id, id))
        .run();
    });
  }

  listDue(attemptedBefore: string, limit: number): Promise<GoogleConnectionRecord[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(connections)
        .where(
          and(
            ne(connections.status, 'reauthorize'),
            or(
              isNull(connections.lastAttemptTs),
              lt(connections.lastAttemptTs, Date.parse(attemptedBefore)),
            ),
          ),
        )
        .orderBy(asc(connections.lastAttemptTs), asc(connections.id))
        .limit(limit)
        .all()
        .map(toConnectionRecord),
    );
  }
}
