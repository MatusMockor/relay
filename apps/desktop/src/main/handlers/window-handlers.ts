import { streamHub } from '../events/hub-stream';
import type { IpcStreamHandlers } from '../ipc/stream-router';
import type { FullScreenState } from '../window/full-screen-state';

const MAX_BUFFERED_STATUSES = 10;

export const createWindowStreamHandlers = (fullScreen: FullScreenState): IpcStreamHandlers => ({
  'app.window.fullScreen': (_input, signal) =>
    streamHub(fullScreen.changes, signal, MAX_BUFFERED_STATUSES, () => [fullScreen.status()]),
});
