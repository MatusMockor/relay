import type { CalendarWindow } from '@relay/engine';
import { type IcalTime, instantOf, toIso } from '../ics/ical-time';

export interface Span {
  readonly start: number;
  readonly end: number;
  readonly allDay: boolean;
}

export interface ZonedTime {
  readonly time: IcalTime;
  readonly tzid: string | null;
}

export const spanOf = (start: ZonedTime, end: ZonedTime, timeZone: string): Span => {
  const startMs = instantOf(start.time, start.tzid, timeZone);
  const endMs = instantOf(end.time, end.tzid, timeZone);
  return { start: startMs, end: Math.max(startMs, endMs), allDay: start.time.isDate };
};

export const overlaps = (span: Span, window: CalendarWindow): boolean => {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  if (span.end === span.start) {
    return span.start >= from && span.start < to;
  }
  return span.start < to && span.end > from;
};

export const isoSpan = (span: Span): { start: string; end: string; allDay: boolean } => ({
  start: toIso(span.start),
  end: toIso(span.end),
  allDay: span.allDay,
});
