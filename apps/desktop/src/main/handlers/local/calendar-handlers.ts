import type { EngineServices } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { IpcInvokeHandlers } from '../../ipc/invoke-router';

export const createCalendarHandlers = (
  services: Pick<EngineServices, 'calendar'>,
  userId: UserId,
): IpcInvokeHandlers => ({
  'local.calendar.occurrences': async (window) => ({
    items: await services.calendar.occurrences(userId, window),
  }),
  'local.calendar.invitations': ({ threadId, timeZone }) =>
    services.calendar.invitations(userId, threadId, timeZone),
  'local.calendar.rsvp': ({ eventId, response, timeZone }) =>
    services.calendar.respond(userId, eventId, response, timeZone),
  'local.calendar.subscriptions.list': () => services.calendar.listSubscriptions(userId),
  'local.calendar.subscriptions.create': (body) =>
    services.calendar.createSubscription(userId, body),
  'local.calendar.subscriptions.update': ({ subscriptionId, patch }) =>
    services.calendar.updateSubscription(userId, subscriptionId, patch),
  'local.calendar.subscriptions.delete': async ({ subscriptionId }) => {
    await services.calendar.deleteSubscription(userId, subscriptionId);
    return { ok: true };
  },
  'local.calendar.subscriptions.refresh': ({ subscriptionId }) =>
    services.calendar.refreshSubscription(userId, subscriptionId),
});
