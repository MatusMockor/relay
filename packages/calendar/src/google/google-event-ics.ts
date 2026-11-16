import type { GoogleAttendee, GoogleEvent, GoogleEventDateTime } from './google-api-schemas';
import { dateProperty, dtstampValue, escapeText, paramValue } from './google-ics-values';

const RECURRENCE_LINE = /^(RRULE|EXRULE|RDATE|EXDATE)[;:][^\r\n]*$/;

const PARTSTAT: Record<NonNullable<GoogleAttendee['responseStatus']>, string> = {
  needsAction: 'NEEDS-ACTION',
  accepted: 'ACCEPTED',
  tentative: 'TENTATIVE',
  declined: 'DECLINED',
};

const textLine = (name: string, value: string | undefined): string[] =>
  value === undefined || value === '' ? [] : [`${name}:${escapeText(value)}`];

const cn = (name: string | undefined): string =>
  name === undefined || name === '' ? '' : `;CN=${paramValue(name)}`;

const SAFE_EMAIL = /^[^\s<>"(),;:\\]+@[^\s<>"(),;:\\]+$/;

const safeEmail = (email: string | undefined): string | null =>
  email !== undefined && SAFE_EMAIL.test(email) ? email : null;

const roleOf = (attendee: GoogleAttendee): string => {
  if (attendee.organizer === true) {
    return 'CHAIR';
  }
  return attendee.optional === true ? 'OPT-PARTICIPANT' : 'REQ-PARTICIPANT';
};

const attendeeLine = (attendee: GoogleAttendee): string[] => {
  const email = safeEmail(attendee.email);
  if (email === null || attendee.resource === true) {
    return [];
  }
  const partstat = PARTSTAT[attendee.responseStatus ?? 'needsAction'];
  return [
    `ATTENDEE${cn(attendee.displayName)};ROLE=${roleOf(attendee)};PARTSTAT=${partstat}:mailto:${email}`,
  ];
};

export interface IcsTiming {
  readonly start: GoogleEventDateTime;
  readonly end: GoogleEventDateTime | null;
}

export const googleEventIcs = (
  event: GoogleEvent,
  uid: string,
  timing: IcsTiming,
  fallbackZone: string | null,
): string | null => {
  const start = dateProperty('DTSTART', timing.start, fallbackZone);
  if (start === null) {
    return null;
  }
  const end = timing.end === null ? null : dateProperty('DTEND', timing.end, fallbackZone);
  const recurrenceId =
    event.originalStartTime === undefined
      ? null
      : dateProperty('RECURRENCE-ID', event.originalStartTime, fallbackZone);
  const organizer = safeEmail(event.organizer?.email);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Relay//Google Calendar//SK',
    'BEGIN:VEVENT',
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${dtstampValue(event.updated)}`,
    start,
    ...(end === null ? [] : [end]),
    ...(recurrenceId === null ? [] : [recurrenceId]),
    ...(event.recurringEventId === undefined
      ? (event.recurrence ?? []).filter((line) => RECURRENCE_LINE.test(line))
      : []),
    `SEQUENCE:${String(event.sequence ?? 0)}`,
    `STATUS:${(event.status ?? 'confirmed').toUpperCase()}`,
    ...textLine('SUMMARY', event.summary),
    ...textLine('LOCATION', event.location),
    ...textLine('DESCRIPTION', event.description),
    ...(organizer === null
      ? []
      : [`ORGANIZER${cn(event.organizer?.displayName)}:mailto:${organizer}`]),
    ...(event.attendees ?? []).flatMap(attendeeLine),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
};
