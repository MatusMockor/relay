import { type IcalTime, instantOf } from '../ics/ical-time';
import { type Span, spanOf } from './occurrence-span';
import type { ParsedEvent } from './parsed-event';
import type { RangeOverride } from './series-plan';
import { wallOf } from './wall-shift';

const DAY_MS = 86_400_000;
const LOCAL_DAY = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}:\d{2})?$/;

interface CalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const dayNumber = ({ year, month, day }: CalendarDay): number =>
  Date.UTC(year, month - 1, day) / DAY_MS;

const anchorDay = (parsed: ParsedEvent, range: RangeOverride, timeZone: string): number => {
  const local = LOCAL_DAY.exec(range.event.recurrenceId ?? '');
  if (local === null) {
    return dayNumber(wallOf(range.from, parsed.start, timeZone));
  }
  const [, year, month, day] = local;
  return dayNumber({ year: Number(year), month: Number(month), day: Number(day) });
};

const occurrenceDay = (parsed: ParsedEvent, time: IcalTime, timeZone: string): number => {
  if (time.isDate) {
    return dayNumber(time);
  }
  const instant = instantOf(time, parsed.start.tzid, timeZone);
  return dayNumber(wallOf(instant, parsed.start, timeZone));
};

export const kindChangeSpan = (
  parsed: ParsedEvent,
  range: RangeOverride,
  time: IcalTime,
  timeZone: string,
): Span => {
  const tzid = range.parsed.start.tzid;
  const start = range.parsed.start.time.clone();
  start.adjust(occurrenceDay(parsed, time, timeZone) - anchorDay(parsed, range, timeZone), 0, 0, 0);
  if (range.parsed.nominal !== null) {
    const end = start.clone();
    end.addDuration(range.parsed.nominal);
    return spanOf({ time: start, tzid }, { time: end, tzid }, timeZone);
  }
  const at = spanOf({ time: start, tzid }, { time: start, tzid }, timeZone);
  return { start: at.start, end: at.start + range.length, allDay: at.allDay };
};
