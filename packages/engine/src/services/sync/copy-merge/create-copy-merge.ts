import type { Clock } from '../../../ports/clock';
import type { Logger } from '../../../ports/logger';
import type { Repositories } from '../../../ports/repositories';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import type { ChangeFlusher } from '../change-flusher';
import type { SyncOptions } from '../sync-options';
import { CopyMergeBackfill } from './copy-merge-backfill';
import { CopyMergeSteps } from './copy-merge-steps';
import { EmailIdResolver } from './email-id-resolver';
import { MergedArrivals } from './merged-arrivals';

export interface CopyMergeComponentsDeps {
  readonly repositories: Repositories;
  readonly unitOfWork: UnitOfWork;
  readonly flusher: ChangeFlusher;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly options: SyncOptions;
}

export const createCopyMergeBackfill = (deps: CopyMergeComponentsDeps): CopyMergeBackfill => {
  const { repositories, options, clock, logger } = deps;
  const resolver = new EmailIdResolver({
    resolutions: repositories.emailIdResolutions,
    syncStates: repositories.syncStates,
    logger,
    batch: options.copyMerge.resolveBatch,
  });
  const steps = new CopyMergeSteps({
    merges: repositories.messageMerges,
    pendingWork: repositories.pendingWork,
    unitOfWork: deps.unitOfWork,
    resolver,
    flusher: deps.flusher,
    arrivals: new MergedArrivals(repositories),
    clock,
    chunkMessages: options.copyMerge.chunkMessages,
    conflictRetryMs: options.reconcile.fullExpungeDiffMs,
  });
  return new CopyMergeBackfill({
    pendingWork: repositories.pendingWork,
    steps,
    clock,
    logger,
    sliceMs: options.copyMerge.sliceMs,
  });
};
