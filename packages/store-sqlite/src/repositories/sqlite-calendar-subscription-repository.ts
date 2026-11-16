import type {
  CalendarFetchRecord,
  CalendarSubscriptionChanges,
  CalendarSubscriptionRecord,
  CalendarSubscriptionRepository,
} from '@relay/engine';
import type { CalendarSubscriptionId, UserId } from '@relay/shared/domain';
import { and, asc, eq, isNull, lt, or } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toSubscriptionRecord, toSubscriptionRow } from '../mappers/calendar-subscription-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { calendarSubscriptions } from '../schema';

const owned = (userId: UserId, subscriptionId: CalendarSubscriptionId) =>
  and(eq(calendarSubscriptions.userId, userId), eq(calendarSubscriptions.id, subscriptionId));

export class SqliteCalendarSubscriptionRepository implements CalendarSubscriptionRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  list(userId: UserId): Promise<CalendarSubscriptionRecord[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(calendarSubscriptions)
        .where(eq(calendarSubscriptions.userId, userId))
        .orderBy(asc(calendarSubscriptions.createdAt), asc(calendarSubscriptions.id))
        .all()
        .map(toSubscriptionRecord),
    );
  }

  findById(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
  ): Promise<CalendarSubscriptionRecord | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(calendarSubscriptions)
        .where(owned(userId, subscriptionId))
        .get();
      return row === undefined ? null : toSubscriptionRecord(row);
    });
  }

  create(record: CalendarSubscriptionRecord): Promise<CalendarSubscriptionRecord> {
    return this.executor.execute((db) =>
      toSubscriptionRecord(
        db.insert(calendarSubscriptions).values(toSubscriptionRow(record)).returning().get(),
      ),
    );
  }

  update(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
    changes: CalendarSubscriptionChanges,
  ): Promise<CalendarSubscriptionRecord | null> {
    return this.executor.execute((db) => {
      const [row] = db
        .update(calendarSubscriptions)
        .set(changes)
        .where(owned(userId, subscriptionId))
        .returning()
        .all();
      return row === undefined ? null : toSubscriptionRecord(row);
    });
  }

  delete(userId: UserId, subscriptionId: CalendarSubscriptionId): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db.delete(calendarSubscriptions).where(owned(userId, subscriptionId)).run().changes > 0,
    );
  }

  lockForRefresh(subscriptionId: CalendarSubscriptionId): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .select({ id: calendarSubscriptions.id })
          .from(calendarSubscriptions)
          .where(eq(calendarSubscriptions.id, subscriptionId))
          .get() !== undefined,
    );
  }

  listDue(attemptedBefore: string, limit: number): Promise<CalendarSubscriptionRecord[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(calendarSubscriptions)
        .where(
          or(
            isNull(calendarSubscriptions.lastAttemptTs),
            lt(calendarSubscriptions.lastAttemptTs, toTimestamp(attemptedBefore)),
          ),
        )
        .orderBy(asc(calendarSubscriptions.lastAttemptTs), asc(calendarSubscriptions.id))
        .limit(limit)
        .all()
        .map(toSubscriptionRecord),
    );
  }

  recordFetch(subscriptionId: CalendarSubscriptionId, record: CalendarFetchRecord): Promise<void> {
    return this.executor.execute((db) => {
      db.update(calendarSubscriptions)
        .set({
          status: record.status,
          lastError: record.lastError,
          lastAttemptAt: record.attemptedAt,
          lastAttemptTs: toTimestamp(record.attemptedAt),
          updatedAt: record.attemptedAt,
          ...(record.syncedAt === null ? {} : { lastSyncedAt: record.syncedAt }),
          ...(record.etag === undefined ? {} : { etag: record.etag }),
          ...(record.lastModified === undefined ? {} : { lastModified: record.lastModified }),
          ...(record.eventCount === undefined ? {} : { eventCount: record.eventCount }),
        })
        .where(eq(calendarSubscriptions.id, subscriptionId))
        .run();
    });
  }
}
