import type {
  CalendarSeries,
  CalendarWindow,
  ExpandedOccurrence,
  StoredCalendarEvent,
} from '../../model/calendar';
import type { CalendarExpander } from '../../ports/calendar-adapters';
import { isMaster, recurrenceInstant } from './series-cut';
import { isRangeRequest } from './series-range-rows';

export interface InvitationTiming {
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
}

type Series = readonly StoredCalendarEvent[];

const DAY_MS = 86_400_000;
const LOOKAHEAD_DAYS = 400;
const RANGE_SEARCH_WINDOWS = 10;

const shift = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * DAY_MS).toISOString();

const byStart = (a: ExpandedOccurrence, b: ExpandedOccurrence): number =>
  Date.parse(a.start) - Date.parse(b.start);

const rangeStart = (event: StoredCalendarEvent): string =>
  new Date(
    Math.min(recurrenceInstant(event.recurrenceId ?? ''), Date.parse(event.startsAt)),
  ).toISOString();

export class InvitationTimingResolver {
  constructor(private readonly expander: CalendarExpander) {}

  resolve(
    event: StoredCalendarEvent,
    series: Series,
    timeZone: string,
    now: string,
  ): InvitationTiming {
    const [first] = this.candidates(event, series, timeZone, now).sort(byStart);
    if (first === undefined) {
      return { start: event.startsAt, end: event.endsAt, allDay: event.allDay };
    }
    return { start: first.start, end: first.end, allDay: first.allDay };
  }

  private candidates(
    event: StoredCalendarEvent,
    series: Series,
    timeZone: string,
    now: string,
  ): ExpandedOccurrence[] {
    if (event.recurring && isMaster(event)) {
      const overrides = series.filter((member) => !isMaster(member));
      return this.expand({ master: event, overrides }, now, timeZone).filter(
        (occurrence) => occurrence.event.status !== 'cancelled',
      );
    }
    const master = series.find(isMaster);
    if (isRangeRequest(event) && event.status !== 'cancelled' && master !== undefined) {
      return this.drivenBy(
        event,
        { master, overrides: series.filter((row) => !isMaster(row)) },
        timeZone,
      );
    }
    const scope: CalendarSeries = isMaster(event)
      ? { master: event, overrides: [] }
      : { master: null, overrides: [event] };
    return this.expander.expand(scope, {
      from: shift(event.startsAt, -2),
      to: shift(event.endsAt, 2),
      timeZone,
    });
  }

  private drivenBy(
    event: StoredCalendarEvent,
    series: CalendarSeries,
    timeZone: string,
  ): ExpandedOccurrence[] {
    const from = shift(rangeStart(event), -2);
    for (let index = 0; index < RANGE_SEARCH_WINDOWS; index += 1) {
      const found = this.expand(series, shift(from, index * LOOKAHEAD_DAYS), timeZone).filter(
        (occurrence) => occurrence.event.id === event.id && occurrence.event.status !== 'cancelled',
      );
      if (found.length > 0) {
        return found;
      }
    }
    return [];
  }

  private expand(series: CalendarSeries, from: string, timeZone: string): ExpandedOccurrence[] {
    const window: CalendarWindow = { from, to: shift(from, LOOKAHEAD_DAYS), timeZone };
    return this.expander.expand(series, window);
  }
}
