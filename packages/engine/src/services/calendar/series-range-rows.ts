import type { StoredCalendarEvent } from '../../model/calendar';

const DAY_MS = 86_400_000;

export const isRangeRequest = (member: StoredCalendarEvent): boolean =>
  member.recurrenceId !== null && member.thisAndFuture === true && member.endsSeries !== true;

export const rangeRowEnd = (row: StoredCalendarEvent, seriesEnd: string | null): string | null => {
  if (seriesEnd === null) {
    return null;
  }
  const own = Date.parse(row.endsAt) + (row.allDay ? DAY_MS : 0);
  return new Date(Math.max(own, Date.parse(seriesEnd))).toISOString();
};
