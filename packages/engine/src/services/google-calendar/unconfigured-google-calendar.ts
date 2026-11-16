import { ForbiddenError } from '../../errors';
import type { GoogleCalendarAdapters } from '../../ports/google-calendar-adapters';
import { GOOGLE_MESSAGES } from './google-messages';

export const unconfiguredGoogleCalendar = (setupHint: string): GoogleCalendarAdapters => {
  const unavailable = (): Promise<never> => Promise.reject(new ForbiddenError(setupHint));
  return {
    gateway: {
      listCalendars: unavailable,
      listEvents: unavailable,
      getEvent: unavailable,
      setAttendance: unavailable,
      insertEvent: unavailable,
      deleteEvent: unavailable,
    },
    credentials: { set: unavailable, delete: () => Promise.resolve() },
    setup: { setup: () => Promise.resolve({ configured: false, setupHint }) },
  };
};

export const UNCONFIGURED_GOOGLE_CALENDAR = unconfiguredGoogleCalendar(
  GOOGLE_MESSAGES.notConfigured,
);
