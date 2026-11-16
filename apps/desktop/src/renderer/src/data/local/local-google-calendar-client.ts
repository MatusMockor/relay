import type { IpcResult, RelayBridge } from '@relay/shared';
import { MailClientError } from '../errors';
import type { GoogleCalendarClient } from '../GoogleCalendarClient';

const unwrap = async <T>(result: Promise<IpcResult<T>>): Promise<T> => {
  const settled = await result;
  if (!settled.ok) {
    throw new MailClientError(settled.error);
  }
  return settled.data;
};

export const createLocalGoogleCalendarClient = (bridge: RelayBridge): GoogleCalendarClient => ({
  googleCalendarOverview: () => unwrap(bridge.invoke('local.calendar.google.overview')),
  connectGoogleCalendar: () =>
    Promise.reject(
      new MailClientError({
        code: 'not_implemented',
        message: 'V lokálnom režime sa Google kalendár pripája priamo cez prihlásenie.',
      }),
    ),
  disconnectGoogleCalendar: async (connectionId) => {
    await unwrap(bridge.invoke('local.calendar.google.disconnect', { connectionId }));
  },
  syncGoogleCalendar: (connectionId) =>
    unwrap(bridge.invoke('local.calendar.google.sync', { connectionId })),
  updateGoogleCalendar: (calendarId, patch) =>
    unwrap(bridge.invoke('local.calendar.google.updateCalendar', { calendarId, patch })),
  createCalendarEvent: (body) => unwrap(bridge.invoke('local.calendar.google.createEvent', body)),
  deleteCalendarEvent: async (eventId) => {
    await unwrap(bridge.invoke('local.calendar.google.deleteEvent', { eventId }));
  },
  respondToCalendarEvent: async (eventId, response) => {
    await unwrap(bridge.invoke('local.calendar.google.respond', { eventId, response }));
  },
});
