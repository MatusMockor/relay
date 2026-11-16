import type { StoredCalendarEvent } from '@relay/engine';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { calendarEvents } from '../../schema';
import { toCalendarEventInsert, toStoredCalendarEvent } from './calendar-event.mapper';

export const saveCalendarEventIfCurrent = async (
  db: DbExecutor,
  event: StoredCalendarEvent,
): Promise<StoredCalendarEvent | null> => {
  const values = toCalendarEventInsert(event);
  if (event.revision === 0) {
    const [inserted] = await db
      .insert(calendarEvents)
      .values(values)
      .onConflictDoNothing()
      .returning();
    return inserted === undefined ? null : toStoredCalendarEvent(inserted);
  }
  const { id: _id, createdAt: _createdAt, ...changes } = values;
  const [updated] = await db
    .update(calendarEvents)
    .set({ ...changes, revision: event.revision + 1 })
    .where(and(eq(calendarEvents.id, event.id), eq(calendarEvents.revision, event.revision)))
    .returning();
  return updated === undefined ? null : toStoredCalendarEvent(updated);
};
