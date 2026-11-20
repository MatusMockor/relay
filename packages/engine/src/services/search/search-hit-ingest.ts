import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { LingeringSessions } from '../shared/lingering-sessions';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { ExclusiveAccountRuns } from '../sync/account-run-queue';
import type { ChangeFlusher } from '../sync/change-flusher';
import type { HistorySummaryIngest } from '../sync/history/history-summary-ingest';
import { quietSyncContext } from '../sync/history/quiet-sync-context';
import type { SearchTarget } from './search-mailboxes';
import type { AccountSearchScope, SearchLiveness } from './search-scope';

export interface SearchHitIngestDeps {
  readonly runs: ExclusiveAccountRuns;
  readonly sessions: LingeringSessions;
  readonly summaries: HistorySummaryIngest;
  readonly flusher: ChangeFlusher;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class SearchHitIngest {
  constructor(private readonly deps: SearchHitIngestDeps) {}

  async ingest(
    scope: AccountSearchScope,
    target: SearchTarget,
    uids: readonly number[],
    live: SearchLiveness,
  ): Promise<boolean> {
    try {
      return await this.deps.runs.exclusive(scope.account.id, () =>
        live() ? this.ingestNow(scope, target, uids) : Promise.resolve(false),
      );
    } catch (error) {
      this.deps.logger.info('Server search could not store found messages', {
        accountId: scope.account.id,
        mailboxId: target.mailbox.id,
        error: errorMessage(error),
      });
      return false;
    }
  }

  private ingestNow(
    scope: AccountSearchScope,
    target: SearchTarget,
    uids: readonly number[],
  ): Promise<boolean> {
    const { userId, account } = scope;
    return this.deps.sessions.with(account, async (provider) => {
      const context = quietSyncContext(
        { userId, account, provider },
        scope.mailboxes,
        scope.splits,
        this.deps.clock,
      );
      const ingested = await this.deps.summaries.ingest(context, target, uids);
      await this.deps.flusher.flushThreads(context);
      return ingested;
    });
  }
}
