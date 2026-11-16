import type { CalendarSeries, StoredCalendarEvent } from '../../model/calendar';
import type { CalendarExpander } from '../../ports/calendar-adapters';

export interface InvitationTiming {
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
}

const DAY_MS = 86_400_000;
const LOOKAHEAD_DAYS = 400;

const shift = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * DAY_MS).toISOString();

export class InvitationTimingResolver {
  constructor(private readonly expander: CalendarExpander) {}

  resolve(
    event: StoredCalendarEvent,
    series: readonly StoredCalendarEvent[],
    timeZone: string,
    now: string,
  ): InvitationTiming {
    const upcoming = event.recurring && event.recurrenceId === null;
    const scope: CalendarSeries = upcoming
      ? { master: event, overrides: series.filter((member) => member.recurrenceId !== null) }
      : {
          master: event.recurrenceId === null ? event : null,
          overrides: event.recurrenceId === null ? [] : [event],
        };
    const window = upcoming
      ? { from: now, to: shift(now, LOOKAHEAD_DAYS), timeZone }
      : { from: shift(event.startsAt, -2), to: shift(event.endsAt, 2), timeZone };
    const [first] = this.expander
      .expand(scope, window)
      .filter((occurrence) => occurrence.event.status !== 'cancelled' || !upcoming)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    if (first === undefined) {
      return { start: event.startsAt, end: event.endsAt, allDay: event.allDay };
    }
    return { start: first.start, end: first.end, allDay: first.allDay };
  }
}
