import type { EngineDeps } from '../../../engine-deps';
import { createBodyHydrator } from '../../bodies/create-offline-bodies';
import type { ChangeFlusher } from '../change-flusher';
import type { MessageIngestor } from '../message-ingestor';
import type { SyncOptions } from '../sync-options';
import { HistoryBackfill } from './history-backfill';
import { HistoryCursors } from './history-cursor';
import { HistoryMailboxBackfill } from './history-mailbox-backfill';
import { HistoryProgressReader } from './history-progress';
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
    hydrator: createBodyHydrator(deps, sync.flusher),
    clock,
    options: sync.options,
  });
};

export const createHistoryProgress = (
  deps: EngineDeps,
  options: SyncOptions,
): HistoryProgressReader | null => {
  const store = deps.historyBackfills;
  if (store === undefined) {
    return null;
  }
  const { repositories } = deps;
  return new HistoryProgressReader({
    accounts: repositories.accounts,
    mailboxes: repositories.mailboxes,
    syncStates: repositories.syncStates,
    store,
    options,
  });
};
