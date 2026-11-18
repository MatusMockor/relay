import type { EventHub } from '../events/event-hub';
import type { IpcInvokeHandlers } from '../ipc/invoke-router';
import type { IpcStreamHandlers } from '../ipc/stream-router';
import type { MailNotification } from '../native/new-mail-notifier';
import type { ThreadOpenRequests } from '../native/thread-open-requests';

export const createNotificationStreamHandlers = (
  requests: ThreadOpenRequests,
): IpcStreamHandlers => ({
  'app.notification.opened': (_input, signal) => requests.stream(signal),
});

export const createNotificationInvokeHandlers = (
  notifications: EventHub<MailNotification>,
): IpcInvokeHandlers => ({
  'app.notification.show': (input) => {
    notifications.publish(input);
    return { ok: true as const };
  },
});
