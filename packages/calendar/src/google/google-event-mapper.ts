import type { CalendarParser, GoogleEventChange, RemoteGoogleEvent } from '@relay/engine';
import type { CalendarPartStat } from '@relay/shared/domain';
import type { GoogleAttendee, GoogleEvent } from './google-api-schemas';
import { googleEventIcs, type IcsTiming } from './google-event-ics';

const PARTSTAT: Record<NonNullable<GoogleAttendee['responseStatus']>, CalendarPartStat> = {
  needsAction: 'needs-action',
  accepted: 'accepted',
  tentative: 'tentative',
  declined: 'declined',
};

const timingOf = (event: GoogleEvent): IcsTiming | null => {
  if (event.status === 'cancelled' && event.originalStartTime !== undefined) {
    return { start: event.start ?? event.originalStartTime, end: event.end ?? null };
  }
  if (event.start === undefined) {
    return null;
  }
  return { start: event.start, end: event.end ?? null };
};

const selfOf = (
  event: GoogleEvent,
): { email: string | null; partstat: CalendarPartStat | null } => {
  const self = event.attendees?.find((attendee) => attendee.self === true);
  if (self?.email !== undefined) {
    return { email: self.email, partstat: PARTSTAT[self.responseStatus ?? 'needsAction'] };
  }
  if (event.organizer?.self === true && event.organizer.email !== undefined) {
    return { email: event.organizer.email, partstat: null };
  }
  return {
    email: event.creator?.self === true ? (event.creator.email ?? null) : null,
    partstat: null,
  };
};

const uidOf = (event: GoogleEvent): string | null => {
  if (event.iCalUID !== undefined) {
    return event.iCalUID;
  }
  return event.recurringEventId === undefined ? `${event.id}@google.com` : null;
};

export class GoogleEventMapper {
  constructor(private readonly parser: CalendarParser) {}

  change(event: GoogleEvent, calendarZone: string | null): GoogleEventChange | null {
    if (event.status === 'cancelled' && event.recurringEventId === undefined) {
      return { kind: 'removed', remoteId: event.id, uid: event.iCalUID ?? null };
    }
    const remote = this.event(event, calendarZone);
    return remote === null ? null : { kind: 'event', event: remote };
  }

  event(event: GoogleEvent, calendarZone: string | null): RemoteGoogleEvent | null {
    const timing = timingOf(event);
    if (timing === null) {
      return null;
    }
    const ics = googleEventIcs(event, event.iCalUID ?? event.id, timing, calendarZone);
    const parsed = ics === null ? undefined : this.parser.parse(ics)?.events[0];
    if (parsed === undefined || !parsed.timed) {
      return null;
    }
    const { timed: _timed, uid: _uid, ...data } = parsed;
    const self = selfOf(event);
    return {
      remoteId: event.id,
      etag: event.etag ?? '',
      uid: uidOf(event),
      recurringRemoteId: event.recurringEventId ?? null,
      data: { ...data, dtstamp: event.updated ?? data.dtstamp },
      myPartstat: self.partstat,
      myEmail: self.email?.toLowerCase() ?? null,
    };
  }
}
