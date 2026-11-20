import type { EngineDeps } from '../../../engine-deps';
import type { ChangeFlusher } from '../change-flusher';
import type { MessageIngestor } from '../message-ingestor';
import type { SyncOptions } from '../sync-options';
import { HistoryBackfill } from './history-backfill';
import { HistoryCursors } from './history-cursor';
import { HistoryMailboxBackfill } from './history-mailbox-backfill';
import { HistorySummaryIngest } from './history-summary-ingest';

export const createHistoryBackfill = (
  deps: EngineDeps,
  sync: {
    readonly ingestor: MessageIngestor;
    readonly flusher: ChangeFlusher;
    readonly options: SyncOptions;
  },
): HistoryBackfill | null => {
  const store = deps.historyBackfills;
  if (store === undefined) {
    return null;
  }
  const { repositories, clock, logger } = deps;
  return new HistoryBackfill({
    mailboxes: repositories.mailboxes,
    syncStates: repositories.syncStates,
    splits: repositories.splits,
    mailbox: new HistoryMailboxBackfill({
      store,
      cursors: new HistoryCursors(store, clock),
      summaries: new HistorySummaryIngest(sync.ingestor, logger),
      flusher: sync.flusher,
      logger,
      options: sync.options.history,
    }),
    clock,
    options: sync.options,
  });
};
