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
import type { DbExecutor } from '../../database/database';
import { calendarEvents } from '../../schema';
import { toDate } from '../../support/timestamps';
import { saveCalendarEventIfCurrent } from './calendar-event-checked-write';
import { seriesKeyOf, toCalendarEventInsert, toStoredCalendarEvent } from './calendar-event.mapper';

const INSERT_CHUNK = 200;

const NEWER_REVISION = sql`excluded.sequence > ${calendarEvents.sequence} or (excluded.sequence = ${calendarEvents.sequence} and coalesce(excluded.dtstamp, '-infinity'::timestamptz) >= coalesce(${calendarEvents.dtstamp}, '-infinity'::timestamptz))`;

export class PgCalendarEventRepository implements CalendarEventRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(userId: UserId, eventId: CalendarEventId): Promise<StoredCalendarEvent | null> {
    const [row] = await this.db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.id, eventId)));
    return row === undefined ? null : toStoredCalendarEvent(row);
  }

  async findSeries(source: CalendarSource, uid: string): Promise<StoredCalendarEvent[]> {
    const rows = await this.db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.seriesKey, seriesKeyOf(source, uid)))
      .orderBy(asc(calendarEvents.recurrenceKey));
    return rows.map(toStoredCalendarEvent);
  }

  async listForRange(userId: UserId, range: CalendarRange): Promise<StoredCalendarEvent[]> {
    const hits = this.db
      .select({ seriesKey: calendarEvents.seriesKey })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.userId, userId),
          lt(calendarEvents.startsAt, toDate(range.to)),
          or(
            isNull(calendarEvents.rangeEndsAt),
            gt(calendarEvents.rangeEndsAt, toDate(range.from)),
          ),
        ),
      );
    const rows = await this.db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.userId, userId), inArray(calendarEvents.seriesKey, hits)))
      .orderBy(asc(calendarEvents.startsAt), asc(calendarEvents.id));
    return rows.map(toStoredCalendarEvent);
  }

  async listByThread(userId: UserId, threadId: ThreadId): Promise<StoredCalendarEvent[]> {
    const rows = await this.db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.userId, userId), eq(calendarEvents.threadId, threadId)))
      .orderBy(asc(calendarEvents.startsAt), asc(calendarEvents.id));
    return rows.map(toStoredCalendarEvent);
  }

  async upsert(event: StoredCalendarEvent): Promise<StoredCalendarEvent> {
    const values = toCalendarEventInsert(event);
    const { id: _id, createdAt: _createdAt, ...changes } = values;
    const [row] = await this.db
      .insert(calendarEvents)
      .values(values)
      .onConflictDoUpdate({
        target: [calendarEvents.seriesKey, calendarEvents.recurrenceKey],
        set: { ...changes, revision: sql`${calendarEvents.revision} + 1` },
        setWhere: NEWER_REVISION,
      })
      .returning();
    if (row !== undefined) {
      return toStoredCalendarEvent(row);
    }
    const [current] = await this.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.seriesKey, values.seriesKey),
          eq(calendarEvents.recurrenceKey, values.recurrenceKey),
        ),
      );
    if (current === undefined) {
      throw new Error(`Calendar event ${event.id} was not stored`);
    }
    return toStoredCalendarEvent(current);
  }

  saveIfCurrent(event: StoredCalendarEvent): Promise<StoredCalendarEvent | null> {
    return saveCalendarEventIfCurrent(this.db, event);
  }

  async updateResponse(
    eventId: CalendarEventId,
    change: CalendarResponseChange,
  ): Promise<StoredCalendarEvent | null> {
    const [row] = await this.db
      .update(calendarEvents)
      .set({
        myPartstat: change.myPartstat,
        attendees: [...change.attendees],
        updatedAt: toDate(change.updatedAt),
        revision: change.expectedRevision + 1,
      })
      .where(
        and(eq(calendarEvents.id, eventId), eq(calendarEvents.revision, change.expectedRevision)),
      )
      .returning();
    return row === undefined ? null : toStoredCalendarEvent(row);
  }

  async replaceSubscriptionEvents(
    subscriptionId: CalendarSubscriptionId,
    events: readonly StoredCalendarEvent[],
  ): Promise<void> {
    await this.db.delete(calendarEvents).where(eq(calendarEvents.subscriptionId, subscriptionId));
    for (let start = 0; start < events.length; start += INSERT_CHUNK) {
      await this.db
        .insert(calendarEvents)
        .values(events.slice(start, start + INSERT_CHUNK).map(toCalendarEventInsert));
    }
  }
}
