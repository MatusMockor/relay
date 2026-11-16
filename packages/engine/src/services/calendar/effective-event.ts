import type { CalendarEventId, UserId } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';
import type { CalendarEventRepository } from '../../ports/calendar-event-repository';
import { cutOffByRange } from './series-cut';

export const effectiveEvent = (
  event: StoredCalendarEvent,
  series: readonly StoredCalendarEvent[],
): StoredCalendarEvent =>
  cutOffByRange(series, event) ? { ...event, status: 'cancelled' } : event;

export const findEffective = async (
  events: CalendarEventRepository,
  userId: UserId,
  eventId: CalendarEventId,
): Promise<StoredCalendarEvent | null> => {
  const event = await events.findById(userId, eventId);
  if (event === null) {
    return null;
  }
  return effectiveEvent(event, await events.findSeries(event.source, event.uid));
};
