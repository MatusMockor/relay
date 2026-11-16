import type { StoredCalendarEvent } from '@relay/engine';
import { compareRevision } from './revision';

const newer = (
  known: StoredCalendarEvent | undefined,
  row: StoredCalendarEvent,
): StoredCalendarEvent => {
  if (known === undefined) {
    return row;
  }
  const [occurrence, record] = row.thisAndFuture === true ? [known, row] : [row, known];
  return compareRevision(occurrence, record) >= 0 ? occurrence : record;
};

export const exactRows = (
  overrides: readonly StoredCalendarEvent[],
): Map<string | null, StoredCalendarEvent> => {
  const rows = new Map<string | null, StoredCalendarEvent>();
  for (const override of overrides) {
    rows.set(override.recurrenceId, newer(rows.get(override.recurrenceId), override));
  }
  return rows;
};
