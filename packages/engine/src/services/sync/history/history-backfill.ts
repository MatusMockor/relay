import type { HistoryMailboxReport, HistorySliceReport } from '../../../model/history-backfill';
import type { Clock } from '../../../ports/clock';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { SplitRepository } from '../../../ports/split-repository';
import type { SyncStateRepository } from '../../../ports/sync-state-repository';
import type { SyncContext } from '../sync-context';
import type { SyncOptions } from '../sync-options';
import type { HistoryMailboxBackfill } from './history-mailbox-backfill';
import { historyMailboxes, type HistoryTarget } from './history-mailboxes';
import { type QuietSession, quietSyncContext } from './quiet-sync-context';
import { type HistoryControl, SliceBudget } from './slice-budget';

export type HistorySession = QuietSession;

export interface HistoryBackfillDeps {
  readonly mailboxes: MailboxRepository;
  readonly syncStates: SyncStateRepository;
  readonly splits: SplitRepository;
  readonly mailbox: HistoryMailboxBackfill;
  readonly clock: Clock;
  readonly options: SyncOptions;
}

export class HistoryBackfill {
  constructor(private readonly deps: HistoryBackfillDeps) {}

  async slice(session: HistorySession, control: HistoryControl): Promise<HistorySliceReport> {
    const { userId, account } = session;
    const mailboxes = await this.deps.mailboxes.listByAccount(userId, account.id);
    const states = await this.deps.syncStates.listByAccount(account.id);
    const splits = await this.deps.splits.listForAccount(userId, account.id);
    const context = quietSyncContext(session, mailboxes, splits, this.deps.clock);
    const targets = historyMailboxes(mailboxes, states, this.deps.options);
    const budget = new SliceBudget(this.deps.options.history, this.deps.clock, control);
    const perMailbox = await this.mailboxes(context, targets, budget);
    return {
      skipped: false,
      processed: perMailbox.reduce((total, report) => total + report.processed, 0),
      more: perMailbox.length < targets.length || perMailbox.some((report) => !report.done),
      perMailbox,
    };
  }

  private async mailboxes(
    context: SyncContext,
    targets: readonly HistoryTarget[],
    budget: SliceBudget,
  ): Promise<HistoryMailboxReport[]> {
    const reports: HistoryMailboxReport[] = [];
    for (const target of targets) {
      if (!budget.canSearch()) {
        return reports;
      }
      reports.push(await this.deps.mailbox.run(context, target, budget));
    }
    return reports;
  }
}
