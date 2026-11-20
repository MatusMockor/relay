import { isThrottlingError } from '../../errors/throttling-error';
import type { RawMessage } from '../../model/remote-mail';
import type { Clock } from '../../ports/clock';
import type { HydrationCandidate, MessageBodyStore } from '../../ports/message-body-store';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { SyncContext } from '../sync/sync-context';
import type { HydrationBatch } from './hydration-batches';
import type { HydrationParse } from './hydration-parse';
import type { HydrationSkips } from './hydration-skips';
import type { OfflineBodyOptions } from './offline-body-options';

export interface HydrationProgress {
  hydrated: number;
  bytes: number;
  more: boolean;
}

export interface HydrationBatchFetchDeps {
  readonly store: MessageBodyStore;
  readonly parse: HydrationParse;
  readonly skips: HydrationSkips;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly options: OfflineBodyOptions;
}

export class HydrationBatchFetch {
  constructor(private readonly deps: HydrationBatchFetchDeps) {}

  async run(context: SyncContext, batch: HydrationBatch, progress: HydrationProgress) {
    const pending = new Map(batch.candidates.map((candidate) => [candidate.uid, candidate]));
    try {
      await this.fetch(context, batch, pending, progress);
    } catch (error) {
      if (isThrottlingError(error)) {
        throw error;
      }
      this.skip(pending);
      throw error;
    }
    this.skip(pending);
  }

  private async fetch(
    context: SyncContext,
    { target, candidates }: HydrationBatch,
    pending: Map<number, HydrationCandidate>,
    progress: HydrationProgress,
  ): Promise<void> {
    if (target === null) {
      return;
    }
    const uids = candidates.map((candidate) => candidate.uid);
    const { path } = target.mailbox;
    for await (const raw of context.provider.fetchUids(path, target.state.uidValidity, uids)) {
      await this.one(context, pending, raw, progress);
    }
  }

  private skip(pending: Map<number, HydrationCandidate>): void {
    pending.forEach((candidate) => {
      this.deps.skips.add(candidate.messageId, this.deps.clock.now());
    });
  }

  private async one(
    context: SyncContext,
    pending: Map<number, HydrationCandidate>,
    raw: RawMessage,
    progress: HydrationProgress,
  ): Promise<void> {
    const candidate = pending.get(raw.uid);
    if (candidate === undefined) {
      return;
    }
    progress.bytes += raw.source.byteLength;
    if (raw.source.byteLength > this.deps.options.hydrateMaxMessageBytes) {
      return;
    }
    const body = await this.deps.parse.parse(raw.source, candidate);
    if (body === null) {
      return;
    }
    pending.delete(raw.uid);
    if (!(await this.deps.store.saveBody(candidate.messageId, body))) {
      return;
    }
    progress.hydrated += 1;
    await this.deps.unitOfWork.run((repositories) =>
      context.journal.touched(repositories.pendingWork, candidate.threadId),
    );
  }
}
