import type { IpcStreamHandlers } from '../ipc/stream-router';
import type { MenuCommandRequests } from '../native/menu-command-requests';

export const createMenuCommandStreamHandlers = (
  requests: MenuCommandRequests,
): IpcStreamHandlers => ({
  'app.menu.command': (_input, signal) => requests.stream(signal),
});
