import { compareRevisions, type StoredCalendarEvent } from '@relay/engine';

const ignoredCut = (override: StoredCalendarEvent, master: StoredCalendarEvent): boolean =>
  override.endsSeries === true && compareRevisions(override, master) < 0;

const cancelledWithSeries = (override: StoredCalendarEvent, master: StoredCalendarEvent): boolean =>
  master.status === 'cancelled' && compareRevisions(override, master) < 0;

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
