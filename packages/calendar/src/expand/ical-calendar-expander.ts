import type {
  CalendarExpander,
  CalendarSeries,
  CalendarWindow,
  ExpandedOccurrence,
  StoredCalendarEvent,
} from '@relay/engine';
import { exactRows } from './exact-rows';
import { occurrenceSpan } from './occurrence-end';
import { occurrenceTimes } from './occurrence-times';
import { isoSpan, overlaps, spanOf } from './occurrence-span';
import { type ParsedEvent, parsedEventOf } from './parsed-event';
import { rangeSpan } from './range-span';
import { keyInstant } from './recurrence-instant';
import { isTombstone, liveOverrides } from './live-overrides';
import { cutAt, hiddenByCut, rangeAt, shownAt, visibleLeftover } from './series-choice';
import { orphaned } from './series-membership';
import { type SeriesPlan, seriesPlan } from './series-plan';
import { seriesRangeEndOf } from './series-range-end';

const single = (stored: StoredCalendarEvent, window: CalendarWindow): ExpandedOccurrence[] => {
  const parsed = parsedEventOf(stored);
  if (parsed === null) {
    return [];
  }
  const span = spanOf(parsed.start, parsed.end, window.timeZone);
  if (!overlaps(span, window)) {
    return [];
  }
  return [{ event: stored, recurrenceId: stored.recurrenceId, ...isoSpan(span) }];
};

const masterless = (
  overrides: readonly StoredCalendarEvent[],
  window: CalendarWindow,
): ExpandedOccurrence[] => {
  const plan = seriesPlan(null, overrides, window.timeZone);
  return [...exactRows(overrides).values()]
    .filter((override) => !hiddenByCut(override, plan))
    .flatMap((override) => single(override, window));
};

const startOf = (master: StoredCalendarEvent, timeZone: string): number => {
  const parsed = parsedEventOf(master);
  return parsed === null
    ? Date.parse(master.startsAt)
    : spanOf(parsed.start, parsed.end, timeZone).start;
};

export class IcalCalendarExpander implements CalendarExpander {
  expand(series: CalendarSeries, window: CalendarWindow): ExpandedOccurrence[] {
    const { master } = series;
    if (master === null) {
      return masterless(series.overrides, window);
    }
    if (!master.recurring) {
      return this.standalone(master, series.overrides, window);
    }
    return this.recurring(master, liveOverrides(master, series.overrides), window);
  }

  seriesRangeEnd(
    master: StoredCalendarEvent,
    overrides: readonly StoredCalendarEvent[],
  ): string | null {
    const parsed = parsedEventOf(master);
    if (parsed === null || !master.recurring) {
      return master.rangeEndsAt;
    }
    return seriesRangeEndOf(parsed, seriesPlan(master, liveOverrides(master, overrides), 'UTC'));
  }

  isOrphaned(master: StoredCalendarEvent, override: StoredCalendarEvent): boolean {
    const parsed = parsedEventOf(master);
    if (parsed === null || !master.recurring || override.recurrenceId === null) {
      return false;
    }
    return orphaned(override, master, parsed, 'UTC');
  }

  private standalone(
    master: StoredCalendarEvent,
    overrides: readonly StoredCalendarEvent[],
    window: CalendarWindow,
  ): ExpandedOccurrence[] {
    if (overrides.length === 0) {
      return single(master, window);
    }
    const live = liveOverrides(master, overrides);
    if (isTombstone(master, overrides)) {
      return masterless(live, window);
    }
    const plan = seriesPlan(master, live, window.timeZone);
    const cut = cutAt(plan, startOf(master, window.timeZone)) !== undefined;
    return single(cut ? { ...master, status: 'cancelled' } : master, window);
  }

  private recurring(
    master: StoredCalendarEvent,
    overrides: readonly StoredCalendarEvent[],
    window: CalendarWindow,
  ): ExpandedOccurrence[] {
    const parsed = parsedEventOf(master);
    if (parsed === null) {
      return [];
    }
    const { timeZone } = window;
    const plan = seriesPlan(master, overrides, timeZone);
    const byKey = exactRows(overrides);
    const results: ExpandedOccurrence[] = [];
    const to = Date.parse(window.to) + plan.reachAhead;
    try {
      for (const { time, key } of occurrenceTimes(
        parsed,
        Date.parse(window.from) - plan.reachBack,
      )) {
        const at = keyInstant(key, timeZone);
        if (at >= plan.stopAt) {
          break;
        }
        const exact = byKey.get(key);
        byKey.delete(key);
        if (exact !== undefined && shownAt(exact, plan, at)) {
          results.push(...single(exact, window));
          continue;
        }
        if (at >= to) {
          break;
        }
        if (cutAt(plan, at) !== undefined) {
          continue;
        }
        const range = rangeAt(plan, at);
        const span =
          range === undefined
            ? occurrenceSpan(parsed, time, key, timeZone)
            : rangeSpan(parsed, range, time, timeZone);
        if (overlaps(span, window)) {
          results.push({ event: range?.event ?? master, recurrenceId: key, ...isoSpan(span) });
        }
      }
    } catch {
      return results;
    }
    return [...results, ...this.leftovers(master, parsed, [...byKey.values()], plan, window)];
  }

  private leftovers(
    master: StoredCalendarEvent,
    parsed: ParsedEvent,
    overrides: readonly StoredCalendarEvent[],
    plan: SeriesPlan,
    window: CalendarWindow,
  ): ExpandedOccurrence[] {
    return overrides
      .filter((override) => visibleLeftover(override, plan))
      .flatMap((override) => single(override, window))
      .filter(({ event }) => !orphaned(event, master, parsed, window.timeZone));
  }
}
