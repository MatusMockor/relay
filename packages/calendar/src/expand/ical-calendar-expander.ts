import type {
  CalendarExpander,
  CalendarSeries,
  CalendarWindow,
  ExpandedOccurrence,
  StoredCalendarEvent,
} from '@relay/engine';
import { occurrenceSpan } from './occurrence-end';
import { occurrenceTimes } from './occurrence-times';
import { isoSpan, overlaps, spanOf } from './occurrence-span';
import { parsedEventOf } from './parsed-event';
import { rangeSpan } from './range-span';
import { keyInstant } from './recurrence-instant';
import { exactWins, hiddenByCut, rangeAt, visibleLeftover } from './series-choice';
import { seriesPlan } from './series-plan';
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

export class IcalCalendarExpander implements CalendarExpander {
  expand(series: CalendarSeries, window: CalendarWindow): ExpandedOccurrence[] {
    const { master } = series;
    if (master === null) {
      const plan = seriesPlan(null, series.overrides, window.timeZone);
      return series.overrides
        .filter((override) => !hiddenByCut(override, plan))
        .flatMap((override) => single(override, window));
    }
    if (!master.recurring) {
      return single(master, window);
    }
    return this.recurring(master, series.overrides, window);
  }

  seriesRangeEnd(
    master: StoredCalendarEvent,
    overrides: readonly StoredCalendarEvent[],
  ): string | null {
    const parsed = parsedEventOf(master);
    if (parsed === null || !master.recurring) {
      return master.rangeEndsAt;
    }
    return seriesRangeEndOf(parsed, seriesPlan(master, overrides, 'UTC'));
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
    const byKey = new Map(overrides.map((override) => [override.recurrenceId, override]));
    const results: ExpandedOccurrence[] = [];
    const to = Date.parse(window.to) + plan.reachAhead;
    try {
      for (const { time, key } of occurrenceTimes(
        parsed,
        Date.parse(window.from) - plan.reachBack,
      )) {
        const at = keyInstant(key, timeZone);
        if (at >= plan.cutAt) {
          break;
        }
        const exact = byKey.get(key);
        byKey.delete(key);
        const range = rangeAt(plan, at);
        if (exact !== undefined && exactWins(exact, range)) {
          results.push(...single(exact, window));
          continue;
        }
        if (at >= to) {
          break;
        }
        const span =
          range === undefined
            ? occurrenceSpan(parsed, time, key, timeZone)
            : rangeSpan(parsed, range, time, key, timeZone);
        if (overlaps(span, window)) {
          results.push({ event: range?.event ?? master, recurrenceId: key, ...isoSpan(span) });
        }
      }
    } catch {
      return results;
    }
    const leftovers = [...byKey.values()].filter((override) => visibleLeftover(override, plan));
    return [...results, ...leftovers.flatMap((override) => single(override, window))];
  }
}
