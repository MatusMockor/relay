import { compareRevisions, type StoredCalendarEvent } from '@relay/engine';

const slotRank = (row: StoredCalendarEvent): number => {
  if (row.thisAndFuture !== true) {
    return 2;
  }
  return row.endsSeries === true ? 1 : 0;
};

const newer = (
  known: StoredCalendarEvent | undefined,
  row: StoredCalendarEvent,
): StoredCalendarEvent => {
  if (known === undefined) {
    return row;
  }
  return (compareRevisions(row, known) || slotRank(row) - slotRank(known)) > 0 ? row : known;
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
