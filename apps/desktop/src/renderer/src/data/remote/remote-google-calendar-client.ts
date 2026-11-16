import { api } from '@relay/shared';
import type { GoogleCalendarClient } from '../GoogleCalendarClient';
import type { HttpApi } from './HttpApi';

export const createRemoteGoogleCalendarClient = (http: HttpApi): GoogleCalendarClient => ({
  googleCalendarOverview: () => http.call(api.googleCalendar.overview, {}),
  connectGoogleCalendar: (oauth) => http.call(api.googleCalendar.connect, { body: { oauth } }),
  disconnectGoogleCalendar: async (id) => {
    await http.call(api.googleCalendar.disconnect, { params: { id } });
  },
  syncGoogleCalendar: (id) => http.call(api.googleCalendar.sync, { params: { id } }),
  updateGoogleCalendar: (id, body) =>
    http.call(api.googleCalendar.updateCalendar, { params: { id }, body }),
  createCalendarEvent: (body) => http.call(api.googleCalendar.createEvent, { body }),
  deleteCalendarEvent: async (id) => {
    await http.call(api.googleCalendar.deleteEvent, { params: { id } });
  },
  respondToCalendarEvent: async (id, response) => {
    await http.call(api.googleCalendar.respond, { params: { id }, body: { response } });
  },
});
