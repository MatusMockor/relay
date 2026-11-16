import type { GoogleEventRecord } from '@relay/engine';
import type { GoogleCalendarId } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { calendarEvents as events } from '../../schema';
import { seriesKeyOf } from '../calendar/calendar-event.mapper';

const keyOf = (seriesKey: string, recurrenceKey: string): string =>
  JSON.stringify([seriesKey, recurrenceKey]);

export const withCarriedRevisions = async (
  db: DbExecutor,
  calendarId: GoogleCalendarId,
  records: readonly GoogleEventRecord[],
): Promise<GoogleEventRecord[]> => {
  const rows = await db
    .select({
      seriesKey: events.seriesKey,
      recurrenceKey: events.recurrenceKey,
      revision: events.revision,
    })
    .from(events)
    .where(eq(events.googleCalendarId, calendarId));
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
