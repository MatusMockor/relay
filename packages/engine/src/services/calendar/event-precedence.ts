import type { CalendarAttendee, CalendarPartStat } from '@relay/shared/domain';
import type { CalendarEventData, StoredCalendarEvent } from '../../model/calendar';
import { compareRevisions } from './revision-order';

const stampOf = (value: string | null): number => (value === null ? 0 : Date.parse(value));

export const supersedes = (
  incoming: CalendarEventData,
  stored: StoredCalendarEvent | undefined,
): boolean => stored === undefined || compareRevisions(incoming, stored) >= 0;

export const sameRevision = (incoming: CalendarEventData, stored: StoredCalendarEvent): boolean =>
  incoming.sequence === stored.sequence &&
  stampOf(incoming.dtstamp) === stampOf(stored.dtstamp) &&
  incoming.status === stored.status;

export const findAttendee = (
  attendees: readonly CalendarAttendee[],
  email: string,
): CalendarAttendee | null =>
  attendees.find((attendee) => attendee.email.toLowerCase() === email.toLowerCase()) ?? null;

export const resolveMyPartstat = (
  mine: CalendarAttendee | null,
  incoming: CalendarEventData,
  stored: StoredCalendarEvent | undefined,
): CalendarPartStat | null => {
  if (mine === null) {
    return stored?.myPartstat ?? null;
  }
  if (stored === undefined || incoming.sequence > stored.sequence) {
    return mine.partstat;
  }
  if (mine.partstat === 'needs-action' && stored.myPartstat !== null) {
    return stored.myPartstat;
  }
  return mine.partstat;
};

export const isOlderReply = (known: CalendarAttendee | null, dtstamp: string | null): boolean =>
  known?.repliedAt !== undefined &&
  known.repliedAt !== null &&
  stampOf(dtstamp) < stampOf(known.repliedAt);

export const withAttendeeStatus = (
  attendees: readonly CalendarAttendee[],
  replier: CalendarAttendee,
): CalendarAttendee[] => {
  const known = findAttendee(attendees, replier.email);
  if (known === null) {
    return [...attendees, replier];
  }
  return attendees.map((attendee) =>
    attendee === known
      ? { ...attendee, partstat: replier.partstat, repliedAt: replier.repliedAt ?? null }
      : attendee,
  );
};
