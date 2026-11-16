import type { StoredCalendarEvent } from '@relay/engine';
import type { CalendarEventStatus } from '@relay/shared/domain';
import { spanOf, type ZonedTime } from './occurrence-span';
import { type ParsedEvent, parsedEventOf } from './parsed-event';
import { keyInstant } from './recurrence-instant';
import { compareRevision } from './revision';
import { wallShift } from './wall-shift';

export interface RangeOverride {
  readonly event: StoredCalendarEvent;
  readonly shown: StoredCalendarEvent;
  readonly parsed: ParsedEvent;
  readonly from: number;
  readonly shift: number;
  readonly offset: number;
  readonly length: number;
}

export interface SeriesCut {
  readonly event: StoredCalendarEvent;
  readonly from: number;
}

export interface SeriesPlan {
  readonly timeZone: string;
  readonly cuts: readonly SeriesCut[];
  readonly ranges: readonly RangeOverride[];
  readonly stopAt: number;
  readonly reachBack: number;
  readonly reachAhead: number;
}

const isCut = (event: StoredCalendarEvent): boolean =>
  event.recurrenceId !== null && event.endsSeries === true;

const isRanged = (event: StoredCalendarEvent): boolean =>
  event.recurrenceId !== null && event.thisAndFuture === true && event.endsSeries !== true;

export const recurrenceAt = (event: StoredCalendarEvent, timeZone: string): number =>
  keyInstant(event.recurrenceId ?? '', timeZone);

const cutsOf = (
  master: StoredCalendarEvent | null,
  overrides: readonly StoredCalendarEvent[],
  timeZone: string,
): SeriesCut[] =>
  overrides
    .filter(
      (override) => isCut(override) && (master === null || compareRevision(override, master) >= 0),
    )
    .map((event) => ({ event, from: recurrenceAt(event, timeZone) }))
    .sort((a, b) => a.from - b.from);

export const lifts = (range: RangeOverride, cut: SeriesCut): boolean =>
  range.from >= cut.from && compareRevision(range.event, cut.event) > 0;

const stopOf = (cuts: readonly SeriesCut[], ranges: readonly RangeOverride[]): number =>
  cuts.find((cut) => !ranges.some((range) => lifts(range, cut)))?.from ?? Number.POSITIVE_INFINITY;

const HOUR_MS = 3_600_000;

const requestStatusOf = (parsed: ParsedEvent): CalendarEventStatus => {
  const status: unknown = parsed.event.component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'TENTATIVE'
    ? 'tentative'
    : 'confirmed';
};

const rangeOf = (
  event: StoredCalendarEvent,
  zone: ZonedTime | null,
  timeZone: string,
): RangeOverride[] => {
  const parsed = parsedEventOf(event);
  if (parsed === null) {
    return [];
  }
  const span = spanOf(parsed.start, parsed.end, timeZone);
  const from = recurrenceAt(event, timeZone);
  const offset = span.start - from;
  const timed = zone !== null && !zone.time.isDate && !parsed.start.time.isDate;
  const shift = timed ? wallShift(from, span.start, zone, timeZone) : offset;
  const shown =
    event.status === 'cancelled' ? { ...event, status: requestStatusOf(parsed) } : event;
  return [{ event, shown, parsed, from, shift, offset, length: span.end - span.start }];
};

const latest = (range: RangeOverride): number =>
  Math.max(range.shift, range.offset) + range.length + HOUR_MS;

const earliest = (range: RangeOverride): number => Math.min(range.shift, range.offset) - HOUR_MS;

export const seriesPlan = (
  master: StoredCalendarEvent | null,
  overrides: readonly StoredCalendarEvent[],
  timeZone: string,
): SeriesPlan => {
  const cuts = cutsOf(master, overrides, timeZone);
  const zone = master === null ? null : (parsedEventOf(master)?.start ?? null);
  const ranges = overrides
    .filter(isRanged)
    .flatMap((override) => rangeOf(override, zone, timeZone));
  return {
    timeZone,
    cuts,
    ranges,
    stopAt: stopOf(cuts, ranges),
    reachBack: Math.max(0, ...ranges.map(latest)),
    reachAhead: Math.max(0, ...ranges.map((range) => -earliest(range))),
  };
};
