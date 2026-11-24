import type { EngineDeps } from '../../engine-deps';
import type { LingeringSessions } from '../shared/lingering-sessions';
import { systemIntervalTimer } from '../shared/system-interval-timer';
import type { SyncComponents } from '../sync/create-sync-service';
import { HistorySummaryIngest } from '../sync/history/history-summary-ingest';
import { AccountSearchPlanner } from './account-search-planner';
import { AccountTextSearch } from './account-text-search';
import { HistoryCompletion } from './history-completion';
import { MailboxTextSearch } from './mailbox-text-search';
import { RemoteBodies } from './remote-bodies';
import { SearchHitIngest } from './search-hit-ingest';
import { SearchHitResolver } from './search-hit-resolver';
import { DEFAULT_SEARCH_OPTIONS } from './search-options';
import { ServerSearchService } from './server-search-service';

export const createServerSearchService = (
  deps: EngineDeps,
  sessions: LingeringSessions,
  sync: SyncComponents,
): ServerSearchService => {
  const { repositories, clock } = deps;
  const logger = deps.logger.child({ component: 'server-search' });
  const options = { ...DEFAULT_SEARCH_OPTIONS, ...deps.options.search };
  return new ServerSearchService({
    accounts: repositories.accounts,
    threads: repositories.threads,
    planner: new AccountSearchPlanner({
      mailboxes: repositories.mailboxes,
      syncStates: repositories.syncStates,
      splits: repositories.splits,
      completion: new HistoryCompletion(deps.historyBackfills, sync.options),
      remoteBodies: new RemoteBodies(deps.messageBodies),
      sync: sync.options,
      options,
    }),
    search: new AccountTextSearch({
      mailboxSearch: new MailboxTextSearch(sessions, logger),
      resolver: new SearchHitResolver({
        messages: repositories.messages,
        syncStates: repositories.syncStates,
        lookup: deps.messageUids,
      }),
      ingest: new SearchHitIngest({
        runs: sync.runs,
        sessions,
        summaries: new HistorySummaryIngest(sync.ingestor, logger),
        flusher: sync.flusher,
        clock,
        logger,
      }),
    }),
    timer: deps.intervalTimer ?? systemIntervalTimer,
    options,
  });
};
