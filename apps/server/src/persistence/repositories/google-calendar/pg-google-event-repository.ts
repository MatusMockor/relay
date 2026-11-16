import type { GoogleEventRecord, GoogleEventRepository } from '@relay/engine';
import type { CalendarEventId, GoogleCalendarId, UserId } from '@relay/shared/domain';
import { and, asc, eq, getTableColumns, isNotNull, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { type CalendarEventRow, calendarEvents as events } from '../../schema';
import {
  seriesKeyOf,
  toCalendarEventInsert,
  toStoredCalendarEvent,
} from '../calendar/calendar-event.mapper';
import { withCarriedRevisions } from './google-event-revisions';

const INSERT_CHUNK = 200;
const KEPT = new Set([
  'id',
  'userId',
  'seriesKey',
  'recurrenceKey',
  'messageId',
  'threadId',
  'createdAt',
]);

const UPDATED = Object.fromEntries(
  Object.entries(getTableColumns(events))
    .filter(([key]) => !KEPT.has(key))
    .map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)]),
);

const toRecord = (row: CalendarEventRow): GoogleEventRecord | null => {
  const event = toStoredCalendarEvent(row);
  if (event.source.kind !== 'google' || row.remoteId === null) {
    return null;
  }
  return {
    event,
    calendarId: event.source.calendarId,
    remoteId: row.remoteId,
    etag: row.remoteEtag ?? '',
  };
};

export class PgGoogleEventRepository implements GoogleEventRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(userId: UserId, eventId: CalendarEventId): Promise<GoogleEventRecord | null> {
    const [row] = await this.db
      .select()
      .from(events)
      .where(and(eq(events.userId, userId), eq(events.id, eventId)));
    return row === undefined ? null : toRecord(row);
  }

  async findByRemoteId(
    calendarId: GoogleCalendarId,
    remoteId: string,
  ): Promise<GoogleEventRecord | null> {
    const [row] = await this.db
      .select()
      .from(events)
      .where(and(eq(events.googleCalendarId, calendarId), eq(events.remoteId, remoteId)));
    return row === undefined ? null : toRecord(row);
  }

  async findByUid(userId: UserId, uid: string): Promise<GoogleEventRecord[]> {
    const rows = await this.db
      .select()
      .from(events)
      .where(
        and(eq(events.userId, userId), eq(events.uid, uid), isNotNull(events.googleCalendarId)),
      )
      .orderBy(asc(events.recurrenceKey), asc(events.id));
    return rows.flatMap((row) => toRecord(row) ?? []);
  }

  async save(records: readonly GoogleEventRecord[]): Promise<void> {
    for (let start = 0; start < records.length; start += INSERT_CHUNK) {
      const chunk = records.slice(start, start + INSERT_CHUNK);
      await this.db
        .insert(events)
        .values(
          chunk.map((record) => ({
            ...toCalendarEventInsert(record.event),
            remoteId: record.remoteId,
            remoteEtag: record.etag,
            revision: record.event.revision + 1,
          })),
        )
        .onConflictDoUpdate({
          target: [events.seriesKey, events.recurrenceKey],
          set: { ...UPDATED, revision: sql`${events.revision} + 1` },
        });
    }
  }

  async removeSeries(calendarId: GoogleCalendarId, uid: string): Promise<void> {
    await this.db
      .delete(events)
      .where(eq(events.seriesKey, seriesKeyOf({ kind: 'google', calendarId }, uid)));
  }

  async replaceCalendar(
    calendarId: GoogleCalendarId,
    records: readonly GoogleEventRecord[],
  ): Promise<void> {
    const carried = await withCarriedRevisions(this.db, calendarId, records);
    await this.db.delete(events).where(eq(events.googleCalendarId, calendarId));
    await this.save(carried);
  }
}
