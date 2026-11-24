import type { Mailbox } from '@relay/shared/domain';
import type { Clock } from '../../../ports/clock';
import type { Logger } from '../../../ports/logger';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import { labelsMessages } from '../../shared/mail-copies';
import { errorMessage } from '../../shared/mail-provider-sessions';
import type { SyncBackfill } from '../sync-backfill';
import type { SyncContext } from '../sync-context';
import { CopyMergeBudget } from './copy-merge-budget';
import { type CopyMergeProgress, emptyProgress, madeProgress } from './copy-merge-progress';
import { COPY_MERGE_REF, type CopyMergeRow, isWaiting, stateOf } from './copy-merge-state';
import type { CopyMergeSteps } from './copy-merge-steps';

export interface CopyMergeBackfillDeps {
  readonly pendingWork: PendingWorkRepository;
  readonly steps: CopyMergeSteps;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly sliceMs: number;
}

export class CopyMergeBackfill implements SyncBackfill {
  constructor(private readonly deps: CopyMergeBackfillDeps) {}

  async run(context: SyncContext, mailboxes: readonly Mailbox[]): Promise<void> {
    const { account } = context;
    const key = { accountId: account.id, kind: 'copy-merge', ref: COPY_MERGE_REF } as const;
    const row = await this.deps.pendingWork.find(key);
    if (row === null) {
      return;
    }
    if (!labelsMessages(account)) {
      await this.deps.pendingWork.remove([row]);
      return;
    }
    if (isWaiting(stateOf(row), this.deps.clock.now())) {
      return;
    }
    const progress = emptyProgress();
    const started = this.deps.clock.now().getTime();
    await this.guarded(context, 'Copy merge paused', () =>
      this.drive(context, mailboxes, row, progress),
    );
    this.report(context, progress, started);
  }

  private async drive(
    context: SyncContext,
    mailboxes: readonly Mailbox[],
    first: CopyMergeRow,
    progress: CopyMergeProgress,
  ): Promise<void> {
    const budget = new CopyMergeBudget(this.deps.sliceMs, this.deps.clock);
    let row: CopyMergeRow | null = first;
    while (row !== null) {
      row = await this.deps.steps.next({ context, mailboxes, row, progress });
      if (budget.expired()) {
        return;
      }
    }
  }

  private report(context: SyncContext, progress: CopyMergeProgress, started: number): void {
    if (!madeProgress(progress)) {
      return;
    }
    const { rescanQueued: _rescanQueued, ...counts } = progress;
    this.deps.logger.info('Copy merge progress', {
      accountId: context.account.id,
      ...counts,
      ms: this.deps.clock.now().getTime() - started,
    });
  }

  private async guarded(
    context: SyncContext,
    failure: string,
    work: () => Promise<void>,
  ): Promise<void> {
    try {
      await work();
    } catch (error) {
      this.deps.logger.warn(failure, {
        accountId: context.account.id,
        error: errorMessage(error),
      });
    }
  }
}
