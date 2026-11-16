import type { StoredCalendarEvent } from '../../model/calendar';
import type { CalendarExpander } from '../../ports/calendar-adapters';
import { isMaster } from './series-cut';
import { isRangeRequest, rangeRowEnd } from './series-range-rows';

const seriesEnds = (
  events: readonly StoredCalendarEvent[],
  ranged: ReadonlySet<string>,
  expander: CalendarExpander,
): Map<string, string | null> =>
  new Map(
    events
      .filter((event) => isMaster(event) && event.recurring && ranged.has(event.uid))
      .map((master) => [
        master.uid,
        expander.seriesRangeEnd(
          master,
          events.filter((other) => other.uid === master.uid && !isMaster(other)),
        ),
      ]),
  );

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
  const ends = seriesEnds(events, ranged, expander);
  return events.map((event) => {
    if (!ends.has(event.uid)) {
      return event;
    }
    const end = ends.get(event.uid) ?? null;
    if (isMaster(event)) {
      return { ...event, rangeEndsAt: end };
    }
    return isRangeRequest(event) ? { ...event, rangeEndsAt: rangeRowEnd(event, end) } : event;
  });
};
