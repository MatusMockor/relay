import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { RawMessage } from '../../model/remote-mail';
import type { HydrationCandidate, MessageBodyStore } from '../../ports/message-body-store';
import type { OfflineWindowPolicy } from '../../ports/offline-window-policy';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { ChangeFlusher } from '../sync/change-flusher';
import type { HistoryTarget } from '../sync/history/history-mailboxes';
import type { SyncContext } from '../sync/sync-context';
import { type HydrationBatch, planHydration } from './hydration-batches';
import type { HydrationParse } from './hydration-parse';
import type { HydrationSkips } from './hydration-skips';
import type { OfflineBodyOptions } from './offline-body-options';

export interface HydrationGate {
  expired(): boolean;
}

export interface HydrationReport {
  readonly hydrated: number;
  readonly more: boolean;
}

export interface BodyHydratorDeps {
  readonly store: MessageBodyStore;
  readonly policy: OfflineWindowPolicy;
  readonly parse: HydrationParse;
  readonly skips: HydrationSkips;
  readonly flusher: ChangeFlusher;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly options: OfflineBodyOptions;
}

interface Progress {
  hydrated: number;
  bytes: number;
  more: boolean;
}

export class BodyHydrator {
  constructor(private readonly deps: BodyHydratorDeps) {}

  async run(
    context: SyncContext,
    targets: readonly HistoryTarget[],
    gate: HydrationGate,
  ): Promise<HydrationReport> {
    const progress: Progress = { hydrated: 0, bytes: 0, more: false };
    try {
      await this.hydrate(context, targets, gate, progress);
    } catch (error) {
      progress.more = false;
      this.deps.logger.warn('Offline body hydration paused', {
        accountId: context.account.id,
        error: errorMessage(error),
      });
    }
    if (progress.hydrated > 0) {
      await this.deps.flusher.flushThreads(context);
    }
    return { hydrated: progress.hydrated, more: progress.more };
  }

  private async hydrate(
    context: SyncContext,
    targets: readonly HistoryTarget[],
    gate: HydrationGate,
    progress: Progress,
  ): Promise<void> {
    if (gate.expired()) {
      return;
    }
    const { store, options, clock } = this.deps;
    const candidates = await store.hydrationCandidates(
      context.account.id,
      await this.deps.policy.cutoff(),
      options.hydrateMessages,
      this.deps.skips.active(clock.now()),
    );
    progress.more = candidates.length >= options.hydrateMessages;
    const plan = planHydration(candidates, targets, {
      batchSize: options.hydrateFetchBatch,
      batchBytes: options.hydrateBatchBytes,
      messageBytes: options.hydrateMaxMessageBytes,
    });
    plan.oversized.forEach((candidate) => {
      this.deps.skips.add(candidate.messageId, clock.now());
    });
    for (const batch of plan.batches) {
      if (gate.expired() || this.overBudget(progress, batch)) {
        progress.more = true;
        return;
      }
      await this.batch(context, batch, progress);
    }
  }

  private overBudget(progress: Progress, batch: HydrationBatch): boolean {
    return progress.bytes > 0 && progress.bytes + batch.bytes >= this.deps.options.hydrateBytes;
  }

  private async batch(context: SyncContext, batch: HydrationBatch, progress: Progress) {
    const { target, candidates } = batch;
    const pending = new Map(candidates.map((candidate) => [candidate.uid, candidate]));
    try {
      if (target !== null) {
        const uids = candidates.map((candidate) => candidate.uid);
        const { path } = target.mailbox;
        for await (const raw of context.provider.fetchUids(path, target.state.uidValidity, uids)) {
          await this.one(context, pending, raw, progress);
        }
      }
    } finally {
      pending.forEach((candidate) => {
        this.deps.skips.add(candidate.messageId, this.deps.clock.now());
      });
    }
  }

  private async one(
    context: SyncContext,
    pending: Map<number, HydrationCandidate>,
    raw: RawMessage,
    progress: Progress,
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
