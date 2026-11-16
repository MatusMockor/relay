import type { StoredCalendarEvent } from '@relay/engine';
import { spanOf, type ZonedTime } from './occurrence-span';
import { type ParsedEvent, parsedEventOf } from './parsed-event';
import { keyInstant } from './recurrence-instant';
import { compareRevision } from './revision';
import { wallShift } from './wall-shift';

export interface RangeOverride {
  readonly event: StoredCalendarEvent;
  readonly parsed: ParsedEvent;
  readonly from: number;
  readonly shift: number;
  readonly offset: number;
  readonly length: number;
  readonly slack: number;
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

const cutsOf = (overrides: readonly StoredCalendarEvent[], timeZone: string): SeriesCut[] =>
  overrides
    .filter(isCut)
    .map((event) => ({
      event,
      from: recurrenceAt(event, timeZone),
    }))
    .sort((a, b) => a.from - b.from);

export const lifts = (range: RangeOverride, cut: SeriesCut): boolean =>
  range.from >= cut.from && compareRevision(range.event, cut.event) > 0;

const stopOf = (cuts: readonly SeriesCut[], ranges: readonly RangeOverride[]): number =>
  cuts.find((cut) => !ranges.some((range) => lifts(range, cut)))?.from ?? Number.POSITIVE_INFINITY;

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

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
  const slack = zone !== null && zone.time.isDate !== parsed.start.time.isDate ? DAY_MS : HOUR_MS;
  return [{ event, parsed, from, shift, offset, length: span.end - span.start, slack }];
};

const latest = (range: RangeOverride): number =>
  Math.max(range.shift, range.offset) + range.length + range.slack;

const earliest = (range: RangeOverride): number =>
  Math.min(range.shift, range.offset) - range.slack;

export const seriesPlan = (
  master: StoredCalendarEvent | null,
  overrides: readonly StoredCalendarEvent[],
  timeZone: string,
): SeriesPlan => {
  const cuts = cutsOf(overrides, timeZone);
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
