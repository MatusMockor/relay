import type {
  CalendarFetchRecord,
  CalendarSubscriptionChanges,
  CalendarSubscriptionRecord,
  CalendarSubscriptionRepository,
} from '@relay/engine';
import type { CalendarSubscriptionId, UserId } from '@relay/shared/domain';
import { and, asc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { calendarSubscriptions } from '../../schema';
import { toDate } from '../../support/timestamps';
import { toSubscriptionInsert, toSubscriptionRecord } from './calendar-subscription.mapper';

const owned = (userId: UserId, subscriptionId: CalendarSubscriptionId) =>
  and(eq(calendarSubscriptions.userId, userId), eq(calendarSubscriptions.id, subscriptionId));

export class PgCalendarSubscriptionRepository implements CalendarSubscriptionRepository {
  constructor(private readonly db: DbExecutor) {}

  async list(userId: UserId): Promise<CalendarSubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.userId, userId))
      .orderBy(asc(calendarSubscriptions.createdAt), asc(calendarSubscriptions.id));
    return rows.map(toSubscriptionRecord);
  }

  async findById(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
  ): Promise<CalendarSubscriptionRecord | null> {
    const [row] = await this.db
      .select()
      .from(calendarSubscriptions)
      .where(owned(userId, subscriptionId));
    return row === undefined ? null : toSubscriptionRecord(row);
  }

  async create(record: CalendarSubscriptionRecord): Promise<CalendarSubscriptionRecord> {
    const [row] = await this.db
      .insert(calendarSubscriptions)
      .values(toSubscriptionInsert(record))
      .returning();
    if (row === undefined) {
      throw new Error(`Calendar subscription ${record.id} was not stored`);
    }
    return toSubscriptionRecord(row);
  }

  async update(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
    changes: CalendarSubscriptionChanges,
  ): Promise<CalendarSubscriptionRecord | null> {
    const [row] = await this.db
      .update(calendarSubscriptions)
      .set({ ...changes, updatedAt: toDate(changes.updatedAt) })
      .where(owned(userId, subscriptionId))
      .returning();
    return row === undefined ? null : toSubscriptionRecord(row);
  }

  async delete(userId: UserId, subscriptionId: CalendarSubscriptionId): Promise<boolean> {
    const rows = await this.db
      .delete(calendarSubscriptions)
      .where(owned(userId, subscriptionId))
      .returning({ id: calendarSubscriptions.id });
    return rows.length > 0;
  }

  async lockForRefresh(subscriptionId: CalendarSubscriptionId): Promise<boolean> {
    const rows = await this.db
      .select({ id: calendarSubscriptions.id })
      .from(calendarSubscriptions)
      .where(eq(calendarSubscriptions.id, subscriptionId))
      .for('update');
    return rows.length > 0;
  }

  async listDue(attemptedBefore: string, limit: number): Promise<CalendarSubscriptionRecord[]> {
    const rows = await this.db
      .select()
      .from(calendarSubscriptions)
      .where(
        or(
          isNull(calendarSubscriptions.lastAttemptAt),
          lt(calendarSubscriptions.lastAttemptAt, toDate(attemptedBefore)),
        ),
      )
      .orderBy(
        sql`${calendarSubscriptions.lastAttemptAt} asc nulls first`,
        asc(calendarSubscriptions.id),
      )
      .limit(limit);
    return rows.map(toSubscriptionRecord);
  }

  async recordFetch(
    subscriptionId: CalendarSubscriptionId,
    record: CalendarFetchRecord,
  ): Promise<void> {
    await this.db
      .update(calendarSubscriptions)
      .set({
        status: record.status,
        lastError: record.lastError,
        lastAttemptAt: toDate(record.attemptedAt),
        updatedAt: toDate(record.attemptedAt),
        ...(record.syncedAt === null ? {} : { lastSyncedAt: toDate(record.syncedAt) }),
        ...(record.etag === undefined ? {} : { etag: record.etag }),
        ...(record.lastModified === undefined ? {} : { lastModified: record.lastModified }),
        ...(record.eventCount === undefined ? {} : { eventCount: record.eventCount }),
      })
      .where(eq(calendarSubscriptions.id, subscriptionId));
  }
}
