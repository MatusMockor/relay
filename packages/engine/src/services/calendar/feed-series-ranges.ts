import type { StoredCalendarEvent } from '../../model/calendar';
import type { CalendarExpander } from '../../ports/calendar-adapters';
import { isMaster } from './series-cut';

export const withSeriesRanges = (
  events: readonly StoredCalendarEvent[],
  expander: CalendarExpander,
): StoredCalendarEvent[] => {
  const ranged = new Set(
    events.filter((event) => event.thisAndFuture === true).map((event) => event.uid),
  );
  if (ranged.size === 0) {
    return [...events];
  }
  return events.map((event) => {
    if (!isMaster(event) || !event.recurring || !ranged.has(event.uid)) {
      return event;
    }
    const overrides = events.filter((other) => other.uid === event.uid && !isMaster(other));
    return { ...event, rangeEndsAt: expander.seriesRangeEnd(event, overrides) };
  });
};
