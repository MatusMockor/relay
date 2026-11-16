import type { GoogleEventRecord } from '@relay/engine';
import type { GoogleCalendarId } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { seriesKeyOf } from '../mappers/calendar-event-mapper';
import { calendarEvents as events } from '../schema';

const keyOf = (seriesKey: string, recurrenceKey: string): string =>
  JSON.stringify([seriesKey, recurrenceKey]);

export const withCarriedRevisions = (
  db: RelayDb,
  calendarId: GoogleCalendarId,
  records: readonly GoogleEventRecord[],
): GoogleEventRecord[] => {
  const rows = db
    .select({
      seriesKey: events.seriesKey,
      recurrenceKey: events.recurrenceKey,
      revision: events.revision,
    })
    .from(events)
    .where(eq(events.googleCalendarId, calendarId))
    .all();
  const previous = new Map(
    rows.map((row) => [keyOf(row.seriesKey, row.recurrenceKey), row.revision]),
  );
  return records.map((record) => {
    const key = keyOf(
      seriesKeyOf(record.event.source, record.event.uid),
      record.event.recurrenceId ?? '',
    );
    const revision = Math.max(previous.get(key) ?? 0, record.event.revision);
    return { ...record, event: { ...record.event, revision } };
  });
};
