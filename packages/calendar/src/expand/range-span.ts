import type { IcalTime } from '../ics/ical-time';
import { occurrenceSpan } from './occurrence-end';
import { type Span, spanOf } from './occurrence-span';
import type { ParsedEvent } from './parsed-event';
import type { RangeOverride } from './series-plan';

const DAY_MS = 86_400_000;

const shiftedDays = (
  time: IcalTime,
  range: RangeOverride,
  tzid: string | null,
  zone: string,
): Span => {
  const start = time.clone();
  start.adjust(Math.round(range.shift / DAY_MS), 0, 0, 0);
  const end = start.clone();
  end.adjust(Math.round(range.length / DAY_MS), 0, 0, 0);
  return spanOf({ time: start, tzid }, { time: end, tzid }, zone);
};

export const rangeSpan = (
  parsed: ParsedEvent,
  range: RangeOverride,
  time: IcalTime,
  key: string,
  timeZone: string,
): Span => {
  const tzid = parsed.start.tzid;
  if (range.parsed.start.time.isDate !== time.isDate) {
    return occurrenceSpan(parsed, time, key, timeZone);
  }
  if (time.isDate) {
    return shiftedDays(time, range, tzid, timeZone);
  }
  const start = time.clone();
  start.adjust(0, 0, 0, Math.round(range.shift / 1000));
  if (range.parsed.nominal !== null) {
    const end = start.clone();
    end.addDuration(range.parsed.nominal);
    return spanOf({ time: start, tzid }, { time: end, tzid }, timeZone);
  }
  const at = spanOf({ time: start, tzid }, { time: start, tzid }, timeZone);
  return { start: at.start, end: at.start + range.length, allDay: false };
};
