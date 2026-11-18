import { EventHub } from './event-hub';
import { streamHub } from './hub-stream';

export class LatestRequestFeed<Request> {
  private readonly hub = new EventHub<Request>();
  private pending: Request[] = [];

  constructor(
    private readonly maxBuffered: number,
    private readonly maxPending = 1,
  ) {}

  request(request: Request): void {
    if (this.hub.listenerCount === 0) {
      this.pending = [...this.pending, request].slice(-this.maxPending);
      return;
    }
    this.hub.publish(request);
  }

  stream(signal: AbortSignal): AsyncGenerator<Request> {
    return streamHub(this.hub, signal, this.maxBuffered, () => this.takePending());
  }

  private takePending(): readonly Request[] {
    const pending = this.pending;
    this.pending = [];
    return pending;
  }
}
