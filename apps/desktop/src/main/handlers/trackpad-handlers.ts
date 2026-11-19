import type { TrackpadScrollEvent } from '@relay/shared/ipc';
import type { EventHub } from '../events/event-hub';
import { streamHub } from '../events/hub-stream';
import type { IpcStreamHandlers } from '../ipc/stream-router';

const MAX_BUFFERED_PHASES = 8;

export const createTrackpadStreamHandlers = (
  scrolls: EventHub<TrackpadScrollEvent>,
): IpcStreamHandlers => ({
  'app.window.trackpadScroll': (_input, signal) => streamHub(scrolls, signal, MAX_BUFFERED_PHASES),
});
