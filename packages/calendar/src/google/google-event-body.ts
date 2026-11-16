import type { GoogleEventDraft } from '@relay/engine';
import { wallTimeAt } from '../ics/wall-clock';
import type { GoogleAttendee } from './google-api-schemas';

const pad = (value: number): string => String(value).padStart(2, '0');

const dateIn = (iso: string, zone: string): string => {
  const wall = wallTimeAt(Date.parse(iso), zone);
  return `${String(wall.year)}-${pad(wall.month)}-${pad(wall.day)}`;
};

const boundary = (iso: string, draft: GoogleEventDraft) =>
  draft.allDay
    ? { date: dateIn(iso, draft.timeZone) }
    : { dateTime: iso, timeZone: draft.timeZone };

export const insertBody = (draft: GoogleEventDraft): Record<string, unknown> => ({
  summary: draft.title,
  ...(draft.location === null ? {} : { location: draft.location }),
  start: boundary(draft.start, draft),
  end: boundary(draft.end, draft),
  ...(draft.attendees.length === 0
    ? {}
    : { attendees: draft.attendees.map((email) => ({ email })) }),
});

export const withResponse = (
  attendees: readonly GoogleAttendee[],
  email: string,
  response: 'accepted' | 'tentative' | 'declined',
): GoogleAttendee[] | null => {
  const target = email.toLowerCase();
  const index = attendees.findIndex(
    (attendee) => attendee.self === true || attendee.email?.toLowerCase() === target,
  );
  if (index === -1) {
    return null;
  }
  return attendees.map((attendee, position) =>
    position === index ? { ...attendee, responseStatus: response } : attendee,
  );
};
