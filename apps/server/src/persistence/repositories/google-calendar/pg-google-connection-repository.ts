import type {
  GoogleConnectionRecord,
  GoogleConnectionRepository,
  GoogleConnectionStatusChange,
} from '@relay/engine';
import type { CalendarConnectionId, UserId } from '@relay/shared/domain';
import { and, asc, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { googleCalendarConnections as connections } from '../../schema';
import { toDate } from '../../support/timestamps';
import { toConnectionInsert, toConnectionRecord } from './google-calendar.mapper';

const owned = (userId: UserId, id: CalendarConnectionId) =>
  and(eq(connections.userId, userId), eq(connections.id, id));

const PUBLIC_COLUMNS = {
  id: connections.id,
  userId: connections.userId,
  email: connections.email,
  accountId: connections.accountId,
  status: connections.status,
  lastError: connections.lastError,
  lastSyncedAt: connections.lastSyncedAt,
  lastAttemptAt: connections.lastAttemptAt,
  createdAt: connections.createdAt,
  updatedAt: connections.updatedAt,
};

export class PgGoogleConnectionRepository implements GoogleConnectionRepository {
  constructor(private readonly db: DbExecutor) {}

  async list(userId: UserId): Promise<GoogleConnectionRecord[]> {
    const rows = await this.db
      .select(PUBLIC_COLUMNS)
      .from(connections)
      .where(eq(connections.userId, userId))
      .orderBy(asc(connections.createdAt), asc(connections.id));
    return rows.map(toConnectionRecord);
  }

  async findById(userId: UserId, id: CalendarConnectionId): Promise<GoogleConnectionRecord | null> {
    const [row] = await this.db.select(PUBLIC_COLUMNS).from(connections).where(owned(userId, id));
    return row === undefined ? null : toConnectionRecord(row);
  }

  async findByEmail(userId: UserId, email: string): Promise<GoogleConnectionRecord | null> {
    const [row] = await this.db
      .select(PUBLIC_COLUMNS)
      .from(connections)
      .where(and(eq(connections.userId, userId), eq(connections.email, email)));
    return row === undefined ? null : toConnectionRecord(row);
  }

  async save(record: GoogleConnectionRecord): Promise<GoogleConnectionRecord> {
    const values = toConnectionInsert(record);
    const { id: _id, createdAt: _createdAt, ...changes } = values;
    const [row] = await this.db
      .insert(connections)
      .values(values)
      .onConflictDoUpdate({ target: connections.id, set: changes })
      .returning(PUBLIC_COLUMNS);
    if (row === undefined) {
      throw new Error(`Google calendar connection ${record.id} was not stored`);
    }
    return toConnectionRecord(row);
  }

  async delete(userId: UserId, id: CalendarConnectionId): Promise<boolean> {
    const rows = await this.db
      .delete(connections)
      .where(owned(userId, id))
      .returning({ id: connections.id });
    return rows.length > 0;
  }

  async recordSync(id: CalendarConnectionId, change: GoogleConnectionStatusChange): Promise<void> {
    await this.db
      .update(connections)
      .set({
        status: change.status,
        lastError: change.lastError,
        lastAttemptAt: toDate(change.attemptedAt),
        ...(change.syncedAt === null ? {} : { lastSyncedAt: toDate(change.syncedAt) }),
      })
      .where(eq(connections.id, id));
  }

  async listDue(attemptedBefore: string, limit: number): Promise<GoogleConnectionRecord[]> {
    const rows = await this.db
      .select(PUBLIC_COLUMNS)
      .from(connections)
      .where(
        and(
          ne(connections.status, 'reauthorize'),
          or(
            isNull(connections.lastAttemptAt),
            lt(connections.lastAttemptAt, toDate(attemptedBefore)),
          ),
        ),
      )
      .orderBy(sql`${connections.lastAttemptAt} asc nulls first`, asc(connections.id))
      .limit(limit);
    return rows.map(toConnectionRecord);
  }
}
