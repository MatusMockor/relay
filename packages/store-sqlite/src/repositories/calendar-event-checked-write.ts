import type { StoredCalendarEvent } from '@relay/engine';
import { and, eq } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { toCalendarEventRow, toStoredCalendarEvent } from '../mappers/calendar-event-mapper';
import { calendarEvents } from '../schema';

export const saveCalendarEventIfCurrent = (
  db: RelayDb,
  event: StoredCalendarEvent,
): StoredCalendarEvent | null => {
  const values = toCalendarEventRow(event);
  if (event.revision === 0) {
    const [inserted] = db
      .insert(calendarEvents)
      .values(values)
      .onConflictDoNothing()
      .returning()
      .all();
    return inserted === undefined ? null : toStoredCalendarEvent(inserted);
  }
  const { id: _id, createdAt: _createdAt, ...changes } = values;
  const [updated] = db
    .update(calendarEvents)
    .set({ ...changes, revision: event.revision + 1 })
    .where(and(eq(calendarEvents.id, event.id), eq(calendarEvents.revision, event.revision)))
    .returning()
    .all();
  return updated === undefined ? null : toStoredCalendarEvent(updated);
};
