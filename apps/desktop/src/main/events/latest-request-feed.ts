import { EventHub } from './event-hub';
import { streamHub } from './hub-stream';

export class LatestRequestFeed<Request> {
  private readonly hub = new EventHub<Request>();
  private pending: Request | null = null;

  constructor(private readonly maxBuffered: number) {}

  request(request: Request): void {
    if (this.hub.listenerCount === 0) {
      this.pending = request;
      return;
    }
    this.hub.publish(request);
  }

  stream(signal: AbortSignal): AsyncGenerator<Request> {
    return streamHub(this.hub, signal, this.maxBuffered, () => this.takePending());
  }

  private takePending(): readonly Request[] {
    const pending = this.pending;
    this.pending = null;
    return pending === null ? [] : [pending];
  }
}
