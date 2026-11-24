import type { CopyMergeWork, Mailbox, ThreadId } from '@relay/shared/domain';
import type { MergeReport } from '../../../model/message-merge';
import type { Clock } from '../../../ports/clock';
import type { MessageMerges } from '../../../ports/message-merges';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import type { UnitOfWork } from '../../../ports/unit-of-work';
import type { ChangeFlusher } from '../change-flusher';
import { queueLabelRescans } from '../label-rescans';
import type { SyncContext } from '../sync-context';
import { type CopyMergeProgress, recordChunk } from './copy-merge-progress';
import {
  afterChunk,
  type CopyMergeRow,
  nextPass,
  resuming,
  retires,
  stateOf,
} from './copy-merge-state';
import type { EmailIdResolver } from './email-id-resolver';
import type { MergedArrivals } from './merged-arrivals';

export interface CopyMergeStepsDeps {
  readonly merges: MessageMerges;
  readonly pendingWork: PendingWorkRepository;
  readonly unitOfWork: UnitOfWork;
  readonly resolver: EmailIdResolver;
  readonly flusher: ChangeFlusher;
  readonly arrivals: MergedArrivals;
  readonly clock: Clock;
  readonly chunkMessages: number;
  readonly conflictRetryMs: number;
}

export interface CopyMergeStep {
  readonly context: SyncContext;
  readonly mailboxes: readonly Mailbox[];
  readonly row: CopyMergeRow;
  readonly progress: CopyMergeProgress;
}

const mergedThreads = (report: MergeReport): ThreadId[] => [
  ...new Set(report.merged.map((group) => group.threadId)),
];

export class CopyMergeSteps {
  constructor(private readonly deps: CopyMergeStepsDeps) {}

  async next(step: CopyMergeStep): Promise<CopyMergeRow | null> {
    const { context, mailboxes, row, progress } = step;
    const stored = stateOf(row);
    const pending =
      stored.resolve ?? (await this.deps.resolver.cursorsOf(context.account.id, mailboxes));
    const resolved = await this.deps.resolver.step(context, mailboxes, pending);
    progress.resolved += resolved.resolved;
    const state = resuming(stored, resolved.cursors);
    if (resolved.cursors.length === 0) {
      return this.merge(step, state);
    }
    const saved = await this.deps.pendingWork.replace(row, state);
    return resolved.blocked ? null : saved;
  }

  private async merge(step: CopyMergeStep, state: CopyMergeWork): Promise<CopyMergeRow | null> {
    const { context, row, progress } = step;
    const accountId = context.account.id;
    const chunk = await this.deps.merges.nextGroups(
      accountId,
      state.afterEmailId,
      this.deps.chunkMessages,
    );
    if (chunk.groups.length === 0) {
      return this.finishPass(row, state);
    }
    const now = this.deps.clock.now();
    const { report, next } = await this.deps.unitOfWork.run(async (repositories) => {
      const merged = await repositories.messageMerges.merge(accountId, chunk.groups);
      for (const threadId of mergedThreads(merged)) {
        await context.journal.touched(repositories.pendingWork, threadId);
      }
      if (merged.merged.length > 0 && !progress.rescanQueued) {
        await queueLabelRescans(repositories, accountId, now.toISOString());
      }
      const saved = await repositories.pendingWork.replace(row, afterChunk(state, chunk, merged));
      return { report: merged, next: saved };
    });
    recordChunk(progress, report, this.deps.clock.now().getTime() - now.getTime());
    if (report.merged.length === 0) {
      return next;
    }
    await this.deps.arrivals.canonicalize(context, report);
    await this.deps.flusher.flushThreads(context);
    return next;
  }

  private async finishPass(row: CopyMergeRow, state: CopyMergeWork): Promise<null> {
    if (retires(state)) {
      await this.deps.pendingWork.remove([row]);
      return null;
    }
    const now = this.deps.clock.now();
    await this.deps.pendingWork.replace(row, nextPass(state, now, this.deps.conflictRetryMs));
    return null;
  }
}
