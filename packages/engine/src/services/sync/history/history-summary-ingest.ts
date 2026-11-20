import type { Logger } from '../../../ports/logger';
import type { MessageIngestor } from '../message-ingestor';
import type { SyncContext } from '../sync-context';
import { skipOnUidValidityChange } from '../uid-validity-guard';
import type { HistoryTarget } from './history-mailboxes';

export class HistorySummaryIngest {
  constructor(
    private readonly ingestor: MessageIngestor,
    private readonly logger: Logger,
  ) {}

  async ingest(
    context: SyncContext,
    target: HistoryTarget,
    uids: readonly number[],
  ): Promise<boolean> {
    const { mailbox, state } = target;
    const summaries = await skipOnUidValidityChange(this.logger, context, mailbox, () =>
      context.provider.fetchSummaries(mailbox.path, state.uidValidity, uids),
    );
    if (summaries === null) {
      return false;
    }
    const newestFirst = [...summaries].sort((left, right) => right.uid - left.uid);
    for (const summary of newestFirst) {
      const outcome = await this.ingestor.ingestSummary(
        {
          userId: context.userId,
          account: context.account,
          mailbox,
          splits: context.splits,
          journal: context.journal,
          publish: false,
          live: false,
          holdCalendar: false,
        },
        summary,
      );
      if (outcome.kind === 'skipped') {
        this.logger.warn('History backfill skipped a message that could not be parsed', {
          accountId: context.account.id,
          mailboxId: mailbox.id,
          uid: summary.uid,
          error: outcome.reason,
        });
      }
    }
    return true;
  }
}
