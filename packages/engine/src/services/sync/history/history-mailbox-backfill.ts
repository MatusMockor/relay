import type { HistoryCursor, HistoryMailboxReport } from '../../../model/history-backfill';
import type { HistoryBackfillRepository } from '../../../ports/history-backfill-repository';
import type { Logger } from '../../../ports/logger';
import type { UidRange } from '../../../ports/mail-provider';
import type { ChangeFlusher } from '../change-flusher';
import type { SyncContext } from '../sync-context';
import type { HistoryOptions } from '../sync-options';
import type { HistoryCursors } from './history-cursor';
import type { HistoryTarget } from './history-mailboxes';
import type { HistorySummaryIngest } from './history-summary-ingest';
import { type HistoryWindow, nextHistoryWindow } from './history-window';
import type { SliceBudget } from './slice-budget';

export interface HistoryMailboxBackfillDeps {
  readonly store: HistoryBackfillRepository;
  readonly cursors: HistoryCursors;
  readonly summaries: HistorySummaryIngest;
  readonly flusher: ChangeFlusher;
  readonly logger: Logger;
  readonly options: HistoryOptions;
}

interface Drained {
  readonly cursor: HistoryCursor;
  readonly processed: number;
  readonly complete: boolean;
}

export class HistoryMailboxBackfill {
  constructor(private readonly deps: HistoryMailboxBackfillDeps) {}

  async run(
    context: SyncContext,
    target: HistoryTarget,
    budget: SliceBudget,
  ): Promise<HistoryMailboxReport> {
    const mailboxId = target.mailbox.id;
    const cursor = await this.deps.cursors.open(target);
    if (cursor.doneAt !== null) {
      return { mailboxId, processed: 0, done: true };
    }
    const status = await context.provider.status(target.mailbox.path);
    if (status.uidValidity !== target.state.uidValidity) {
      this.deps.logger.info('History backfill skipped a mailbox with a new UIDVALIDITY', {
        accountId: context.account.id,
        mailboxId,
      });
      return { mailboxId, processed: 0, done: false };
    }
    return this.windows(context, target, budget, { cursor, processed: 0, complete: true });
  }

  private async windows(
    context: SyncContext,
    target: HistoryTarget,
    budget: SliceBudget,
    progress: Drained,
  ): Promise<HistoryMailboxReport> {
    const mailboxId = target.mailbox.id;
    if (progress.cursor.doneAt !== null) {
      return { mailboxId, processed: progress.processed, done: true };
    }
    if (!progress.complete || budget.exhausted()) {
      return { mailboxId, processed: progress.processed, done: false };
    }
    const window = await nextHistoryWindow(
      { missing: (range) => this.missing(context, target, range) },
      progress.cursor.belowUid,
    );
    if (window.uids.length === 0) {
      await this.deps.cursors.finish(progress.cursor);
      return { mailboxId, processed: progress.processed, done: true };
    }
    const drained = await this.drain(context, target, budget, progress.cursor, window);
    return this.windows(context, target, budget, {
      ...drained,
      processed: progress.processed + drained.processed,
    });
  }

  private async drain(
    context: SyncContext,
    target: HistoryTarget,
    budget: SliceBudget,
    start: HistoryCursor,
    window: HistoryWindow,
  ): Promise<Drained> {
    let cursor = start;
    let processed = 0;
    let offset = 0;
    while (offset < window.uids.length) {
      const size = budget.take(this.deps.options.batch);
      if (size === 0 || budget.exhausted()) {
        return { cursor, processed, complete: false };
      }
      const batch = window.uids.slice(offset, offset + size);
      const ingested = await this.deps.summaries.ingest(context, target, batch);
      if (!ingested) {
        return { cursor, processed, complete: false };
      }
      await this.deps.flusher.flushQuietly(context);
      cursor = await this.deps.cursors.advance(cursor, Math.min(...batch));
      budget.spend(batch.length);
      processed += batch.length;
      offset += batch.length;
    }
    const next =
      window.floor <= 1
        ? await this.deps.cursors.finish(cursor)
        : await this.deps.cursors.advance(cursor, window.floor);
    return { cursor: next, processed, complete: true };
  }

  private async missing(
    context: SyncContext,
    target: HistoryTarget,
    range: UidRange,
  ): Promise<number[]> {
    const found = await context.provider.listUids(target.mailbox.path, { range });
    const stored = new Set(await this.deps.store.storedUids(target.mailbox.id, found));
    return found.filter((uid) => !stored.has(uid));
  }
}
