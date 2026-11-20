import { ProviderError } from '../../errors/errors';
import { isThrottlingError } from '../../errors/throttling-error';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { MessageBodyStore } from '../../ports/message-body-store';
import type { OfflineWindowPolicy } from '../../ports/offline-window-policy';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { ChangeFlusher } from '../sync/change-flusher';
import type { HistoryTarget } from '../sync/history/history-mailboxes';
import type { SyncContext } from '../sync/sync-context';
import { HydrationBatchFetch, type HydrationProgress } from './hydration-batch-fetch';
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

interface Failure {
  readonly error: unknown;
}

export class BodyHydrator {
  private readonly batches: HydrationBatchFetch;

  constructor(private readonly deps: BodyHydratorDeps) {
    this.batches = new HydrationBatchFetch(deps);
  }

  async run(
    context: SyncContext,
    targets: readonly HistoryTarget[],
    gate: HydrationGate,
  ): Promise<HydrationReport> {
    const progress: HydrationProgress = { hydrated: 0, bytes: 0, more: false };
    const failure = await this.attempt(context, targets, gate, progress);
    if (progress.hydrated > 0) {
      await this.deps.flusher.flushThreads(context);
    }
    if (failure === null) {
      return { hydrated: progress.hydrated, more: progress.more };
    }
    if (isThrottlingError(failure.error)) {
      throw new ProviderError('Offline body hydration throttled', { cause: failure.error });
    }
    this.deps.logger.warn('Offline body hydration paused', {
      accountId: context.account.id,
      error: errorMessage(failure.error),
    });
    return { hydrated: progress.hydrated, more: false };
  }

  private async attempt(
    context: SyncContext,
    targets: readonly HistoryTarget[],
    gate: HydrationGate,
    progress: HydrationProgress,
  ): Promise<Failure | null> {
    try {
      await this.hydrate(context, targets, gate, progress);
      return null;
    } catch (error) {
      return { error };
    }
  }

  private async hydrate(
    context: SyncContext,
    targets: readonly HistoryTarget[],
    gate: HydrationGate,
    progress: HydrationProgress,
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
      await this.batches.run(context, batch, progress);
    }
  }

  private overBudget(progress: HydrationProgress, batch: HydrationBatch): boolean {
    return progress.bytes > 0 && progress.bytes + batch.bytes >= this.deps.options.hydrateBytes;
  }
}
