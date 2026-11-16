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
      return series.overrides.flatMap((override) => single(override, window));
    }
    if (!master.recurring) {
      return single(master, window);
    }
    return this.recurring(master, series.overrides, window);
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
    const byKey = new Map(overrides.map((override) => [override.recurrenceId, override]));
    const results: ExpandedOccurrence[] = [];
    const to = Date.parse(window.to);
    try {
      for (const { time, key } of occurrenceTimes(parsed, Date.parse(window.from))) {
        const override = byKey.get(key);
        byKey.delete(key);
        if (override !== undefined) {
          results.push(...single(override, window));
          continue;
        }
        const span = occurrenceSpan(parsed, time, key, window.timeZone);
        if (span.start >= to) {
          break;
        }
        if (overlaps(span, window)) {
          results.push({ event: master, recurrenceId: key, ...isoSpan(span) });
        }
      }
    } catch {
      return results;
    }
    return [...results, ...[...byKey.values()].flatMap((override) => single(override, window))];
  }
}
