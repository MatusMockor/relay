import type { GoogleEventRecord, GoogleEventRepository } from '@relay/engine';
import type { CalendarEventId, GoogleCalendarId, UserId } from '@relay/shared/domain';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import type { RelayDb } from '../database/sqlite-database';
import {
  seriesKeyOf,
  toCalendarEventRow,
  toStoredCalendarEvent,
} from '../mappers/calendar-event-mapper';
import { type CalendarEventRow, calendarEvents as events } from '../schema';
import { chunked } from './chunked';
import { withCarriedRevisions } from './google-event-revisions';

const toRecord = (row: CalendarEventRow): GoogleEventRecord | null => {
  if (row.googleCalendarId === null || row.remoteId === null) {
    return null;
  }
  const event = toStoredCalendarEvent(row);
  if (event.source.kind !== 'google') {
    return null;
  }
  return {
    event,
    calendarId: event.source.calendarId,
    remoteId: row.remoteId,
    etag: row.remoteEtag ?? '',
  };
};

const toRecords = (rows: readonly CalendarEventRow[]): GoogleEventRecord[] =>
  rows.flatMap((row) => toRecord(row) ?? []);

const insertAll = (db: RelayDb, records: readonly GoogleEventRecord[]): void => {
  for (const chunk of chunked(records, 100)) {
    db.insert(events)
      .values(
        chunk.map((record) => ({
          ...toCalendarEventRow(record.event),
          remoteId: record.remoteId,
          remoteEtag: record.etag,
          revision: record.event.revision + 1,
        })),
      )
      .onConflictDoUpdate({
        target: [events.seriesKey, events.recurrenceKey],
        set: {
          remoteId: sql`excluded.remote_id`,
          remoteEtag: sql`excluded.remote_etag`,
          thisAndFuture: sql`excluded.this_and_future`,
          endsSeries: sql`excluded.ends_series`,
          sequence: sql`excluded.sequence`,
          dtstamp: sql`excluded.dtstamp`,
          status: sql`excluded.status`,
          summary: sql`excluded.summary`,
          location: sql`excluded.location`,
          description: sql`excluded.description`,
          organizer: sql`excluded.organizer`,
          attendees: sql`excluded.attendees`,
          myPartstat: sql`excluded.my_partstat`,
          myEmail: sql`excluded.my_email`,
          allDay: sql`excluded.all_day`,
          startsAt: sql`excluded.starts_at`,
          startsTs: sql`excluded.starts_ts`,
          endsAt: sql`excluded.ends_at`,
          recurring: sql`excluded.recurring`,
          rangeEndsAt: sql`excluded.range_ends_at`,
          rangeEndsTs: sql`excluded.range_ends_ts`,
          ics: sql`excluded.ics`,
          updatedAt: sql`excluded.updated_at`,
          revision: sql`${events.revision} + 1`,
        },
      })
      .run();
  }
};

export class SqliteGoogleEventRepository implements GoogleEventRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  findById(userId: UserId, eventId: CalendarEventId): Promise<GoogleEventRecord | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(events)
        .where(and(eq(events.userId, userId), eq(events.id, eventId)))
        .get();
      return row === undefined ? null : toRecord(row);
    });
  }

  findByRemoteId(
    calendarId: GoogleCalendarId,
    remoteId: string,
  ): Promise<GoogleEventRecord | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(events)
        .where(and(eq(events.googleCalendarId, calendarId), eq(events.remoteId, remoteId)))
        .get();
      return row === undefined ? null : toRecord(row);
    });
  }

  findByUid(userId: UserId, uid: string): Promise<GoogleEventRecord[]> {
    return this.executor.execute((db) =>
      toRecords(
        db
          .select()
          .from(events)
          .where(
            and(eq(events.userId, userId), eq(events.uid, uid), isNotNull(events.googleCalendarId)),
          )
          .orderBy(asc(events.recurrenceKey), asc(events.id))
          .all(),
      ),
    );
  }

  save(records: readonly GoogleEventRecord[]): Promise<void> {
    return this.executor.execute((db) => {
      insertAll(db, records);
    });
  }

  removeSeries(calendarId: GoogleCalendarId, uid: string): Promise<void> {
    return this.executor.execute((db) => {
      db.delete(events)
        .where(eq(events.seriesKey, seriesKeyOf({ kind: 'google', calendarId }, uid)))
        .run();
    });
  }

  replaceCalendar(
    calendarId: GoogleCalendarId,
    records: readonly GoogleEventRecord[],
  ): Promise<void> {
    return this.executor.execute((db) => {
      const carried = withCarriedRevisions(db, calendarId, records);
      db.delete(events).where(eq(events.googleCalendarId, calendarId)).run();
      insertAll(db, carried);
    });
  }
}
