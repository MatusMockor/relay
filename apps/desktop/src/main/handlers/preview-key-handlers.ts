import type { PreviewKeyEvent } from '@relay/shared/ipc';
import type { EventHub } from '../events/event-hub';
import { streamHub } from '../events/hub-stream';
import type { IpcStreamHandlers } from '../ipc/stream-router';

const MAX_BUFFERED_KEYS = 4;

export const createPreviewKeyStreamHandlers = (
  keys: EventHub<PreviewKeyEvent>,
): IpcStreamHandlers => ({
  'app.window.previewKey': (_input, signal) => streamHub(keys, signal, MAX_BUFFERED_KEYS),
});
