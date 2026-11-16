import type {
  CalendarEventRepository,
  CalendarRange,
  CalendarResponseChange,
  CalendarSource,
  StoredCalendarEvent,
} from '@relay/engine';
import type {
  CalendarEventId,
  CalendarSubscriptionId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { and, asc, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import {
  seriesKeyOf,
  toCalendarEventRow,
  toStoredCalendarEvent,
} from '../mappers/calendar-event-mapper';
import { toTimestamp } from '../mappers/timestamp';
import { calendarEvents } from '../schema';
import { saveCalendarEventIfCurrent } from './calendar-event-checked-write';
import { chunked } from './chunked';

const INSERT_CHUNK = 100;

const NEWER_REVISION = sql`excluded.sequence > ${calendarEvents.sequence} or (excluded.sequence = ${calendarEvents.sequence} and coalesce(excluded.dtstamp, '') >= coalesce(${calendarEvents.dtstamp}, ''))`;

export class SqliteCalendarEventRepository implements CalendarEventRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  findById(userId: UserId, eventId: CalendarEventId): Promise<StoredCalendarEvent | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, eventId)))
        .get();
      return row === undefined ? null : toStoredCalendarEvent(row);
    });
  }

  findSeries(source: CalendarSource, uid: string): Promise<StoredCalendarEvent[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.seriesKey, seriesKeyOf(source, uid)))
        .orderBy(asc(calendarEvents.recurrenceKey))
        .all()
        .map(toStoredCalendarEvent),
    );
  }

  listForRange(userId: UserId, range: CalendarRange): Promise<StoredCalendarEvent[]> {
    return this.executor.execute((db) => {
      const hits = db
        .select({ seriesKey: calendarEvents.seriesKey })
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.userId, userId),
            lt(calendarEvents.startsTs, toTimestamp(range.to)),
            or(
              isNull(calendarEvents.rangeEndsTs),
              gt(calendarEvents.rangeEndsTs, toTimestamp(range.from)),
            ),
          ),
        );
      return db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, userId), inArray(calendarEvents.seriesKey, hits)))
        .orderBy(asc(calendarEvents.startsTs), asc(calendarEvents.id))
        .all()
        .map(toStoredCalendarEvent);
    });
  }

  listByThread(userId: UserId, threadId: ThreadId): Promise<StoredCalendarEvent[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.threadId, threadId)))
        .orderBy(asc(calendarEvents.startsTs), asc(calendarEvents.id))
        .all()
        .map(toStoredCalendarEvent),
    );
  }

  upsert(event: StoredCalendarEvent): Promise<StoredCalendarEvent> {
    return this.executor.execute((db) => {
      const values = toCalendarEventRow(event);
      const { id: _id, createdAt: _createdAt, ...changes } = values;
      db.insert(calendarEvents)
        .values(values)
        .onConflictDoUpdate({
          target: [calendarEvents.seriesKey, calendarEvents.recurrenceKey],
          set: { ...changes, revision: sql`${calendarEvents.revision} + 1` },
          setWhere: NEWER_REVISION,
        })
        .run();
      const row = db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.seriesKey, values.seriesKey),
            eq(calendarEvents.recurrenceKey, values.recurrenceKey),
          ),
        )
        .get();
      if (row === undefined) {
        throw new Error(`Calendar event ${event.id} was not stored`);
      }
      return toStoredCalendarEvent(row);
    });
  }

  saveIfCurrent(event: StoredCalendarEvent): Promise<StoredCalendarEvent | null> {
    return this.executor.execute((db) => saveCalendarEventIfCurrent(db, event));
  }

  updateResponse(
    eventId: CalendarEventId,
    change: CalendarResponseChange,
  ): Promise<StoredCalendarEvent | null> {
    return this.executor.execute((db) => {
      const [row] = db
        .update(calendarEvents)
        .set({
          myPartstat: change.myPartstat,
          attendees: [...change.attendees],
          updatedAt: change.updatedAt,
          revision: change.expectedRevision + 1,
        })
        .where(
          and(eq(calendarEvents.id, eventId), eq(calendarEvents.revision, change.expectedRevision)),
        )
        .returning()
        .all();
      return row === undefined ? null : toStoredCalendarEvent(row);
    });
  }

  replaceSubscriptionEvents(
    subscriptionId: CalendarSubscriptionId,
    events: readonly StoredCalendarEvent[],
  ): Promise<void> {
    return this.executor.execute((db) => {
      db.delete(calendarEvents).where(eq(calendarEvents.subscriptionId, subscriptionId)).run();
      for (const chunk of chunked(events, INSERT_CHUNK)) {
        db.insert(calendarEvents).values(chunk.map(toCalendarEventRow)).run();
      }
    });
  }
}
