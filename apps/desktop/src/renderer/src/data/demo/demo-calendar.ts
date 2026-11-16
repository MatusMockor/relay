import type {
  CalendarEventId,
  CalendarOccurrence,
  CalendarSubscription,
  CalendarWindowQuery,
} from '@relay/shared';
import type { CalendarClient } from '../CalendarClient';
import type { GoogleCalendarClient } from '../GoogleCalendarClient';
import { DEMO_GOOGLE_CALENDAR } from './demo-google-calendar';
import { MailClientError } from '../errors';

interface DemoEvent {
  readonly day: number;
  readonly start: string;
  readonly end: string;
  readonly title: string;
  readonly location: string;
  readonly color: string;
}

const AGENDA: readonly DemoEvent[] = [
  {
    day: 0,
    start: '10:00',
    end: '10:15',
    title: 'Standup',
    location: 'Partner API · Meet',
    color: '#4b5fa8',
  },
  {
    day: 0,
    start: '11:00',
    end: '12:00',
    title: 'Refinement šprintu 47',
    location: 'Zasadačka Dunaj',
    color: '#9a6a36',
  },
  {
    day: 0,
    start: '14:00',
    end: '15:30',
    title: 'Review MR !412',
    location: 'Blok na sústredenie',
    color: '#4b5fa8',
  },
  {
    day: 0,
    start: '16:00',
    end: '16:30',
    title: '1:1 s Luciou',
    location: 'Zasadačka Váh',
    color: '#3f7d6a',
  },
  {
    day: 1,
    start: '10:00',
    end: '10:15',
    title: 'Standup',
    location: 'Partner API · Meet',
    color: '#4b5fa8',
  },
  {
    day: 1,
    start: '12:00',
    end: '13:00',
    title: 'Obed v bistre na Obchodnej',
    location: 'Bistro',
    color: '#9a6a36',
  },
  {
    day: 1,
    start: '14:00',
    end: '14:30',
    title: 'Deploy 2.15 na produkciu',
    location: 'Po výsledku load testu',
    color: '#8a4f7d',
  },
  {
    day: 3,
    start: '10:00',
    end: '11:00',
    title: 'Retro šprintu 46',
    location: 'Zasadačka Dunaj',
    color: '#5b4f9a',
  },
  {
    day: 3,
    start: '13:00',
    end: '14:30',
    title: 'Plánovanie Q1',
    location: 'Odhady v MD',
    color: '#4b5fa8',
  },
  {
    day: 4,
    start: '14:00',
    end: '15:00',
    title: 'Demo pre Denník Juh',
    location: 'Editor a náhľad článku',
    color: '#5b4f9a',
  },
];

const at = (base: Date, day: number, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + day);
  date.setHours(hours ?? 0, minutes ?? 0, 0, 0);
  return date;
};

const toOccurrence = (base: Date, event: DemoEvent, index: number): CalendarOccurrence => ({
  id: `demo-${String(index)}`,
  eventId: `demo-${String(index)}` as CalendarEventId,
  sourceKind: 'subscription',
  accountId: null,
  subscriptionId: null,
  googleCalendarId: null,
  canDelete: false,
  canRespond: false,
  uid: `demo-${String(index)}@relay.demo`,
  recurrenceId: null,
  title: event.title,
  location: event.location,
  start: at(base, event.day, event.start).toISOString(),
  end: at(base, event.day, event.end).toISOString(),
  allDay: false,
  status: 'confirmed',
  myStatus: null,
  organizer: null,
  threadId: null,
  color: event.color,
});

const overlaps = (occurrence: CalendarOccurrence, window: CalendarWindowQuery): boolean =>
  Date.parse(occurrence.start) < Date.parse(window.to) &&
  Date.parse(occurrence.end) > Date.parse(window.from);

const unsupported = () =>
  Promise.reject(
    new MailClientError({
      code: 'not_implemented',
      message: 'V ukážkovom režime sa kalendáre nedajú pridávať.',
    }),
  );

export const createDemoCalendarClient = (
  now: () => Date,
): CalendarClient & GoogleCalendarClient => ({
  ...DEMO_GOOGLE_CALENDAR,
  listOccurrences: (window) =>
    Promise.resolve(
      AGENDA.map((event, index) => toOccurrence(now(), event, index)).filter((occurrence) =>
        overlaps(occurrence, window),
      ),
    ),
  listInvitations: () => Promise.resolve([]),
  respondToInvitation: unsupported,
  listCalendarSubscriptions: () => Promise.resolve<CalendarSubscription[]>([]),
  createCalendarSubscription: unsupported,
  updateCalendarSubscription: unsupported,
  removeCalendarSubscription: unsupported,
  refreshCalendarSubscription: unsupported,
});
