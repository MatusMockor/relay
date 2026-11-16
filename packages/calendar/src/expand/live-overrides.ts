import type { StoredCalendarEvent } from '@relay/engine';
import { compareRevision } from './revision';

const ignoredCut = (override: StoredCalendarEvent, master: StoredCalendarEvent): boolean =>
  override.endsSeries === true && compareRevision(override, master) < 0;

const cancelledWithSeries = (override: StoredCalendarEvent, master: StoredCalendarEvent): boolean =>
  master.status === 'cancelled' && compareRevision(override, master) < 0;

export const liveOverrides = (
  master: StoredCalendarEvent | null,
  overrides: readonly StoredCalendarEvent[],
): readonly StoredCalendarEvent[] => {
  if (master === null) {
    return overrides;
  }
  return overrides.filter(
    (override) => !ignoredCut(override, master) && !cancelledWithSeries(override, master),
  );
};
