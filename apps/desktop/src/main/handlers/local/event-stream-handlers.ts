import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from '../../events/event-hub';
import { streamHub } from '../../events/hub-stream';
import type { IpcStreamHandlers } from '../../ipc/stream-router';

export const createEventStreamHandlers = (hub: EventHub<RealtimeEvent>): IpcStreamHandlers => ({
  'local.events': (_input, signal) => streamHub(hub, signal),
});
