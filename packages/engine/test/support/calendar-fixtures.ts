import type { CalendarMethod } from '@relay/shared/domain';
import type { ParsedCalendar, ParsedCalendarEvent } from '../../src';
import { ME } from './fixtures';

export const ORGANIZER = { name: 'Peter Kral', email: 'peter@partner.test' };

export const eventData = (overrides: Partial<ParsedCalendarEvent> = {}): ParsedCalendarEvent => ({
  timed: true,
  uid: 'evt-1@partner.test',
  recurrenceId: null,
  sequence: 0,
  dtstamp: '2026-11-15T07:00:00.000Z',
  status: 'confirmed',
  summary: 'Plánovanie Q1',
  location: 'Zasadačka Dunaj',
  description: null,
  organizer: ORGANIZER,
  attendees: [
    { ...ORGANIZER, partstat: 'accepted', role: 'CHAIR' },
    { name: ME.name, email: ME.email, partstat: 'needs-action', role: 'REQ-PARTICIPANT' },
  ],
  allDay: false,
  startsAt: '2026-11-16T09:00:00.000Z',
  endsAt: '2026-11-16T10:00:00.000Z',
  recurring: false,
  rangeEndsAt: '2026-11-16T10:00:00.000Z',
  ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n',
  ...overrides,
});

export const calendarOf = (
  method: CalendarMethod | null,
  ...events: ParsedCalendarEvent[]
): ParsedCalendar => ({ method, events });

export const DAY_WINDOW = {
  from: '2026-11-16T00:00:00.000Z',
  to: '2026-11-17T00:00:00.000Z',
  timeZone: 'Europe/Bratislava',
};
