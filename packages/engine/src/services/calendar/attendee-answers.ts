import type { CalendarAttendee } from '@relay/shared/domain';
import type { CalendarEventData, StoredCalendarEvent } from '../../model/calendar';
import { findAttendee } from './event-precedence';

const stampOf = (value: string | null): number => (value === null ? 0 : Date.parse(value));

const keptAnswer = (
  incoming: CalendarAttendee,
  known: CalendarAttendee | null,
  dtstamp: string | null,
): CalendarAttendee => {
  const repliedAt = known?.repliedAt ?? null;
  if (known === null || repliedAt === null) {
    return incoming;
  }
  if (incoming.partstat === 'needs-action' || stampOf(dtstamp) <= stampOf(repliedAt)) {
    return { ...incoming, partstat: known.partstat, repliedAt };
  }
  return { ...incoming, repliedAt: dtstamp };
};

export const withStoredAnswers = (
  incoming: CalendarEventData,
  stored: StoredCalendarEvent | undefined,
): CalendarAttendee[] => {
  if (stored === undefined || incoming.sequence !== stored.sequence) {
    return [...incoming.attendees];
  }
  return incoming.attendees.map((attendee) =>
    keptAnswer(attendee, findAttendee(stored.attendees, attendee.email), incoming.dtstamp),
  );
};
