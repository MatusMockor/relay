import type { ThreadId } from '@relay/shared/domain';
import type { NotificationOpened } from '@relay/shared/ipc';
import { LatestRequestFeed } from '../events/latest-request-feed';

const MAX_BUFFERED_REQUESTS = 10;

export class ThreadOpenRequests {
  private readonly feed = new LatestRequestFeed<NotificationOpened>(MAX_BUFFERED_REQUESTS);

  request(threadId: ThreadId): void {
    this.feed.request({ threadId });
  }

  stream(signal: AbortSignal): AsyncGenerator<NotificationOpened> {
    return this.feed.stream(signal);
  }
}
