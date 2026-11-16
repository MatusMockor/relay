import type { IpcResult, RelayBridge } from '@relay/shared';
import type { CalendarClient } from '../CalendarClient';
import { MailClientError } from '../errors';

const unwrap = async <T>(result: Promise<IpcResult<T>>): Promise<T> => {
  const settled = await result;
  if (!settled.ok) {
    throw new MailClientError(settled.error);
  }
  return settled.data;
};

export const createLocalCalendarClient = (bridge: RelayBridge): CalendarClient => ({
  listOccurrences: async (window) =>
    (await unwrap(bridge.invoke('local.calendar.occurrences', window))).items,
  listInvitations: (threadId, timeZone) =>
    unwrap(bridge.invoke('local.calendar.invitations', { threadId, timeZone })),
  respondToInvitation: (eventId, response, timeZone) =>
    unwrap(bridge.invoke('local.calendar.rsvp', { eventId, response, timeZone })),
  listCalendarSubscriptions: () => unwrap(bridge.invoke('local.calendar.subscriptions.list')),
  createCalendarSubscription: (body) =>
    unwrap(bridge.invoke('local.calendar.subscriptions.create', body)),
  updateCalendarSubscription: (subscriptionId, patch) =>
    unwrap(bridge.invoke('local.calendar.subscriptions.update', { subscriptionId, patch })),
  removeCalendarSubscription: async (subscriptionId) => {
    await unwrap(bridge.invoke('local.calendar.subscriptions.delete', { subscriptionId }));
  },
  refreshCalendarSubscription: (subscriptionId) =>
    unwrap(bridge.invoke('local.calendar.subscriptions.refresh', { subscriptionId })),
  listFailedInvitations: () => unwrap(bridge.invoke('local.calendar.failedInvitations.list')),
  retryFailedInvitation: (ref) =>
    unwrap(bridge.invoke('local.calendar.failedInvitations.retry', ref)),
  dismissFailedInvitation: async (ref) => {
    await unwrap(bridge.invoke('local.calendar.failedInvitations.dismiss', ref));
  },
});
