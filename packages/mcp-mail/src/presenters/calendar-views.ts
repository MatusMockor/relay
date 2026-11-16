import type { CalendarInvitation, CalendarOccurrence } from '@relay/shared/domain';
import type { CalendarEventsResult, ThreadEventsResult } from '../backend/calendar-tool-types';
import { formatAddress, UNTRUSTED_NOTICE } from './views';
import { zonedDate, zonedDateTime } from './zoned-time';

interface Timed {
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
}

const timesOf = (event: Timed, timeZone: string) =>
  event.allDay
    ? { allDay: true, start: zonedDate(event.start, timeZone), end: zonedDate(event.end, timeZone) }
    : {
        allDay: false,
        start: zonedDateTime(event.start, timeZone),
        end: zonedDateTime(event.end, timeZone),
      };

const occurrenceView = (occurrence: CalendarOccurrence, timeZone: string) => ({
  eventId: occurrence.eventId,
  title: occurrence.title,
  ...timesOf(occurrence, timeZone),
  location: occurrence.location,
  status: occurrence.status,
  myStatus: occurrence.myStatus,
  organizer: occurrence.organizer === null ? null : formatAddress(occurrence.organizer),
  source: occurrence.sourceKind,
  threadId: occurrence.threadId,
});

const invitationView = (invitation: CalendarInvitation, timeZone: string) => ({
  eventId: invitation.eventId,
  title: invitation.title,
  ...timesOf(invitation, timeZone),
  recurring: invitation.recurring,
  location: invitation.location,
  description: invitation.description,
  status: invitation.status,
  method: invitation.method,
  myStatus: invitation.myStatus,
  organizer: invitation.organizer === null ? null : formatAddress(invitation.organizer),
  attendees: invitation.attendees.map((attendee) => ({
    attendee: formatAddress(attendee),
    status: attendee.partstat,
  })),
  conflicts: invitation.conflicts.map((conflict) => ({
    title: conflict.title,
    ...timesOf(conflict, timeZone),
  })),
});

export const eventsView = (result: CalendarEventsResult) => ({
  notice: UNTRUSTED_NOTICE,
  timeZone: result.timeZone,
  events: result.occurrences.map((occurrence) => occurrenceView(occurrence, result.timeZone)),
});

export const threadEventsView = (result: ThreadEventsResult) => ({
  notice: UNTRUSTED_NOTICE,
  timeZone: result.timeZone,
  events: result.invitations.map((invitation) => invitationView(invitation, result.timeZone)),
});
