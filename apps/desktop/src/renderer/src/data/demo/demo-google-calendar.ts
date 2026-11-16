import { MailClientError } from '../errors';
import type { GoogleCalendarClient } from '../GoogleCalendarClient';

const unsupported = () =>
  Promise.reject(
    new MailClientError({
      code: 'not_implemented',
      message: 'V ukážkovom režime sa Google kalendár nedá pripojiť.',
    }),
  );

export const DEMO_GOOGLE_CALENDAR: GoogleCalendarClient = {
  googleCalendarOverview: () =>
    Promise.resolve({ configured: false, setupHint: null, connections: [] }),
  connectGoogleCalendar: unsupported,
  disconnectGoogleCalendar: unsupported,
  syncGoogleCalendar: unsupported,
  updateGoogleCalendar: unsupported,
  createCalendarEvent: unsupported,
  deleteCalendarEvent: unsupported,
  respondToCalendarEvent: unsupported,
};
