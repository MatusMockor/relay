import { api } from '@relay/shared';
import type { CalendarClient } from '../CalendarClient';
import type { HttpApi } from './HttpApi';

export const createRemoteCalendarClient = (http: HttpApi): CalendarClient => ({
  listOccurrences: async (query) => (await http.call(api.calendar.occurrences, { query })).items,
  listInvitations: (threadId, timeZone) =>
    http.call(api.calendar.invitations, { query: { threadId, timeZone } }),
  respondToInvitation: (id, response, timeZone) =>
    http.call(api.calendar.rsvp, { params: { id }, body: { response, timeZone } }),
  listCalendarSubscriptions: () => http.call(api.calendar.listSubscriptions, {}),
  createCalendarSubscription: (body) => http.call(api.calendar.createSubscription, { body }),
  updateCalendarSubscription: (id, body) =>
    http.call(api.calendar.updateSubscription, { params: { id }, body }),
  removeCalendarSubscription: async (id) => {
    await http.call(api.calendar.deleteSubscription, { params: { id } });
  },
  refreshCalendarSubscription: (id) =>
    http.call(api.calendar.refreshSubscription, { params: { id } }),
  listFailedInvitations: () => http.call(api.calendar.listFailedInvitations, {}),
  retryFailedInvitation: (params) => http.call(api.calendar.retryFailedInvitation, { params }),
  dismissFailedInvitation: async (params) => {
    await http.call(api.calendar.dismissFailedInvitation, { params });
  },
});
