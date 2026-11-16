import type { IcalTime } from '../ics/ical-time';
import { type Span, spanOf } from './occurrence-span';
import type { ParsedEvent } from './parsed-event';

export const occurrenceSpan = (
  parsed: ParsedEvent,
  occurrence: IcalTime,
  key: string,
  timeZone: string,
): Span => {
  const start = { time: occurrence, tzid: parsed.start.tzid };
  const period = parsed.periods.get(key);
  if (period !== undefined) {
    const at = spanOf(start, start, timeZone);
    return { start: at.start, end: at.start + period, allDay: at.allDay };
  }
  if (parsed.nominal !== null) {
    const end = occurrence.clone();
    end.addDuration(parsed.nominal);
    return spanOf(start, { time: end, tzid: parsed.start.tzid }, timeZone);
  }
  const base = spanOf(parsed.start, parsed.end, timeZone);
  const at = spanOf(start, start, timeZone);
  return { start: at.start, end: at.start + (base.end - base.start), allDay: base.allDay };
};
