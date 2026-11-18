import type { IpcStreamHandlers } from '../ipc/stream-router';
import type { ThreadOpenRequests } from '../native/thread-open-requests';

export const createNotificationStreamHandlers = (
  requests: ThreadOpenRequests,
): IpcStreamHandlers => ({
  'app.notification.opened': (_input, signal) => requests.stream(signal),
});
