import { NotificationOpenedSchema, type RelayBridge, type ThreadId } from '@relay/shared';

export type ThreadOpenListener = (threadId: ThreadId) => void;

export class ThreadOpenFeed {
  private readonly listeners = new Set<ThreadOpenListener>();
  private pending: ThreadId | null = null;
  private connected = false;

  constructor(private readonly bridge: RelayBridge) {}

  subscribe(listener: ThreadOpenListener): () => void {
    this.connect();
    this.listeners.add(listener);
    this.flushTo(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private connect(): void {
    if (this.connected) {
      return;
    }
    this.connected = true;
    const disconnect = () => {
      this.connected = false;
    };
    this.bridge.subscribe('app.notification.opened', {
      onEvent: (event) => {
        const parsed = NotificationOpenedSchema.safeParse(event);
        if (!parsed.success) {
          return;
        }
        this.deliver(parsed.data.threadId);
      },
      onEnd: disconnect,
      onError: disconnect,
    });
  }

  private deliver(threadId: ThreadId): void {
    if (this.listeners.size === 0) {
      this.pending = threadId;
      return;
    }
    [...this.listeners].forEach((listener) => {
      listener(threadId);
    });
  }

  private flushTo(listener: ThreadOpenListener): void {
    const pending = this.pending;
    if (pending === null) {
      return;
    }
    this.pending = null;
    listener(pending);
  }
}
