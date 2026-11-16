import type { StoredCalendarEvent } from '@relay/engine';
import { MAX_ITERATIONS } from '../ics/series-range';
import { occurrenceTimes } from './occurrence-times';
import type { ParsedEvent } from './parsed-event';
import { keyInstant } from './recurrence-instant';
import { compareRevision } from './revision';

const isOccurrence = (parsed: ParsedEvent, key: string, timeZone: string): boolean => {
  const target = keyInstant(key, timeZone);
  let seen = 0;
  try {
    for (const occurrence of occurrenceTimes(parsed, target)) {
      const at = keyInstant(occurrence.key, timeZone);
      if (at >= target) {
        return at === target;
      }
      seen += 1;
    }
    return seen >= MAX_ITERATIONS - 1;
  } catch {
    return true;
  }
};

export const orphaned = (
  override: StoredCalendarEvent,
  master: StoredCalendarEvent,
  parsed: ParsedEvent,
  timeZone: string,
): boolean =>
  compareRevision(override, master) < 0 &&
  !isOccurrence(parsed, override.recurrenceId ?? '', timeZone);
