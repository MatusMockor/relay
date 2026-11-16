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
}

export interface SeriesPlan {
  readonly timeZone: string;
  readonly cut: StoredCalendarEvent | null;
  readonly cutAt: number;
  readonly ranges: readonly RangeOverride[];
  readonly reachBack: number;
  readonly reachAhead: number;
}

const isRanged = (event: StoredCalendarEvent): boolean =>
  event.recurrenceId !== null && event.thisAndFuture === true;

export const recurrenceAt = (event: StoredCalendarEvent, timeZone: string): number =>
  keyInstant(event.recurrenceId ?? '', timeZone);

const cutOf = (
  master: StoredCalendarEvent | null,
  overrides: readonly StoredCalendarEvent[],
  timeZone: string,
): StoredCalendarEvent | null =>
  overrides
    .filter(
      (override) =>
        isRanged(override) &&
        override.status === 'cancelled' &&
        (master === null || compareRevision(override, master) >= 0),
    )
    .reduce<StoredCalendarEvent | null>(
      (earliest, override) =>
        earliest === null || recurrenceAt(override, timeZone) < recurrenceAt(earliest, timeZone)
          ? override
          : earliest,
      null,
    );

const HOUR_MS = 3_600_000;

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
  return [{ event, parsed, from, shift, offset, length: span.end - span.start }];
};

const latest = (range: RangeOverride): number =>
  Math.max(range.shift, range.offset) + range.length + HOUR_MS;

const earliest = (range: RangeOverride): number =>
  Math.min(range.shift, range.offset) - HOUR_MS;

export const seriesPlan = (
  master: StoredCalendarEvent | null,
  overrides: readonly StoredCalendarEvent[],
  timeZone: string,
): SeriesPlan => {
  const cut = cutOf(master, overrides, timeZone);
  const cutAt = cut === null ? Number.POSITIVE_INFINITY : recurrenceAt(cut, timeZone);
  const zone = master === null ? null : (parsedEventOf(master)?.start ?? null);
  const ranges = overrides
    .filter((override) => isRanged(override) && override.status !== 'cancelled')
    .flatMap((override) => rangeOf(override, zone, timeZone))
    .filter((range) => range.from < cutAt);
  return {
    timeZone,
    cut,
    cutAt,
    ranges,
    reachBack: Math.max(0, ...ranges.map(latest)),
    reachAhead: Math.max(0, ...ranges.map((range) => -earliest(range))),
  };
};
