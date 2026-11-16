import type { CalendarSeries, StoredCalendarEvent } from '../../model/calendar';
import { seriesKey } from './calendar-source';

export const groupSeries = (events: readonly StoredCalendarEvent[]): CalendarSeries[] => {
  const groups = new Map<string, StoredCalendarEvent[]>();
  for (const event of events) {
    const key = seriesKey(event);
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  return [...groups.values()].map((members) => ({
    master: members.find((member) => member.recurrenceId === null) ?? null,
    overrides: members.filter((member) => member.recurrenceId !== null),
  }));
};
