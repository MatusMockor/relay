import type { ThreadId } from '@relay/shared/domain';
import type { NotificationOpened } from '@relay/shared/ipc';
import { EventHub } from '../events/event-hub';
import { streamHub } from '../events/hub-stream';

const MAX_BUFFERED_REQUESTS = 10;

export class ThreadOpenRequests {
  private readonly hub = new EventHub<NotificationOpened>();
  private pending: NotificationOpened | null = null;

  request(threadId: ThreadId): void {
    const request = { threadId };
    if (this.hub.listenerCount === 0) {
      this.pending = request;
      return;
    }
    this.hub.publish(request);
  }

  stream(signal: AbortSignal): AsyncGenerator<NotificationOpened> {
    return streamHub(this.hub, signal, MAX_BUFFERED_REQUESTS, () => this.takePending());
  }

  private takePending(): readonly NotificationOpened[] {
    const pending = this.pending;
    this.pending = null;
    return pending === null ? [] : [pending];
  }
}
