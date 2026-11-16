import type { CalendarEventId, UserId } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';
import type { CalendarExpander } from '../../ports/calendar-adapters';
import type { CalendarEventRepository } from '../../ports/calendar-event-repository';
import { isRangeRecord } from './recurrence-slot';
import { compareRevisions } from './revision-order';
import { cutAtSeriesStart, cutOffByRange, isMaster } from './series-cut';

export type SeriesMembership = Pick<CalendarExpander, 'isOrphaned'>;

type Series = readonly StoredCalendarEvent[];

const cancelledWithSeries = (event: StoredCalendarEvent, master: StoredCalendarEvent): boolean =>
  master.status === 'cancelled' && compareRevisions(event, master) < 0;

const overrideGone = (
  event: StoredCalendarEvent,
  series: Series,
  membership: SeriesMembership,
): boolean => {
  const master = series.find(isMaster);
  if (master === undefined) {
    return false;
  }
  return (
    cancelledWithSeries(event, master) ||
    (!isRangeRecord(event) && membership.isOrphaned(master, event))
  );
};

const gone = (event: StoredCalendarEvent, series: Series, membership: SeriesMembership) => {
  if (isMaster(event)) {
    return cutAtSeriesStart(series);
  }
  return cutOffByRange(series, event) || overrideGone(event, series, membership);
};

export const effectiveEvent = (
  event: StoredCalendarEvent,
  series: Series,
  membership: SeriesMembership,
): StoredCalendarEvent =>
  gone(event, series, membership) ? { ...event, status: 'cancelled' } : event;

export const findEffective = async (
  events: CalendarEventRepository,
  membership: SeriesMembership,
  userId: UserId,
  eventId: CalendarEventId,
): Promise<StoredCalendarEvent | null> => {
  const event = await events.findById(userId, eventId);
  if (event === null) {
    return null;
  }
  return effectiveEvent(event, await events.findSeries(event.source, event.uid), membership);
};
