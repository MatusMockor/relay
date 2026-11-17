import type { SyncArrivalBatch, SyncArrivalListener } from './sync-arrivals';

export class CompositeArrivalListener implements SyncArrivalListener {
  constructor(private readonly listeners: readonly SyncArrivalListener[]) {}

  async onArrivals(batch: SyncArrivalBatch): Promise<void> {
    const outcomes = await Promise.allSettled(
      this.listeners.map((listener) => listener.onArrivals(batch)),
    );
    const failure = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failure === undefined) {
      return;
    }
    const reason: unknown = failure.reason;
    throw reason instanceof Error ? reason : new Error(String(reason));
  }
}
