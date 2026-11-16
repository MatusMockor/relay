import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import { isMaster, recurrenceInstant } from './series-cut';

type Timing = Pick<
  ParsedCalendarEvent,
  'allDay' | 'startsAt' | 'endsAt' | 'recurring' | 'rangeEndsAt'
>;

type Series = readonly StoredCalendarEvent[];

const ownTiming = (event: ParsedCalendarEvent): Timing => ({
  allDay: event.allDay,
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  recurring: event.recurring,
  rangeEndsAt: event.rangeEndsAt,
});

const instanceTiming = (recurrenceId: string, master: StoredCalendarEvent | undefined): Timing => {
  const start = recurrenceInstant(recurrenceId);
  const length = master === undefined ? 0 : Date.parse(master.endsAt) - Date.parse(master.startsAt);
  const end = new Date(start + length).toISOString();
  return {
    allDay: master?.allDay ?? false,
    startsAt: new Date(start).toISOString(),
    endsAt: end,
    recurring: false,
    rangeEndsAt: end,
  };
};

const tombstoneTiming = (series: Series): Timing | null => {
  const [first] = [...series].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  if (first === undefined) {
    return null;
  }
  return {
    allDay: first.allDay,
    startsAt: first.startsAt,
    endsAt: first.endsAt,
    recurring: false,
    rangeEndsAt: first.endsAt,
  };
};

export const cancelTiming = (event: ParsedCalendarEvent, series: Series): Timing | null => {
  if (event.timed) {
    return ownTiming(event);
  }
  if (event.recurrenceId !== null) {
    return instanceTiming(event.recurrenceId, series.find(isMaster));
  }
  return tombstoneTiming(series);
};
