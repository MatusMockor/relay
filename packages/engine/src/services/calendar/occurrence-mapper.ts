import type { CalendarOccurrence } from '@relay/shared/domain';
import type { ExpandedOccurrence } from '../../model/calendar';
import type { ColorLookup } from './calendar-colors';
import { NO_ACCESS, type OccurrenceAccess } from '../google-calendar/google-event-access';

export type AccessLookup = (occurrence: ExpandedOccurrence) => OccurrenceAccess;

export const toOccurrence = (
  occurrence: ExpandedOccurrence,
  colorOf: ColorLookup,
  accessOf: AccessLookup = () => NO_ACCESS,
): CalendarOccurrence => {
  const { event } = occurrence;
  return {
    id: `${event.id}:${occurrence.recurrenceId ?? 'single'}`,
    eventId: event.id,
    sourceKind: event.source.kind,
    accountId: event.source.kind === 'invite' ? event.source.accountId : null,
    subscriptionId: event.source.kind === 'subscription' ? event.source.subscriptionId : null,
    googleCalendarId: event.source.kind === 'google' ? event.source.calendarId : null,
    ...accessOf(occurrence),
    uid: event.uid,
    recurrenceId: occurrence.recurrenceId,
    title: event.summary,
    location: event.location,
    start: occurrence.start,
    end: occurrence.end,
    allDay: occurrence.allDay,
    status: event.status,
    myStatus: event.myPartstat,
    organizer: event.organizer,
    threadId: event.threadId,
    color: colorOf(event.source),
  };
};

export const byStart = (a: CalendarOccurrence, b: CalendarOccurrence): number =>
  Date.parse(a.start) - Date.parse(b.start) || Number(b.allDay) - Number(a.allDay);
