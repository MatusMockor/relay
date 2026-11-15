import type { EngineDeps } from '../../engine-deps';
import type { ProviderOpReplayer } from '../actions/provider-op-replayer';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import { AccountSynchronizer } from './account-synchronizer';
import { ChangeFlusher } from './change-flusher';
import type { JiraTaskSink } from './jira-task-sink';
import type { SyncArrivalListener } from './sync-arrivals';
import { KeywordLabels } from './keyword-labels';
import { MailboxReconciler } from './mailbox-reconciler';
import { MailboxRefresher } from './mailbox-refresher';
import { MailboxSynchronizer } from './mailbox-synchronizer';
import { MessageIngestor } from './message-ingestor';
import { NewMessageFetcher } from './new-message-fetcher';
import { DEFAULT_SYNC_OPTIONS } from './sync-options';
import { SyncReporter } from './sync-reporter';
import { SyncService } from './sync-service';

export interface SyncComponents {
  readonly service: SyncService;
  readonly ingestor: MessageIngestor;
  readonly flusher: ChangeFlusher;
}

export const createSyncComponents = (
  deps: EngineDeps,
  shared: {
    readonly events: EngineEvents;
    readonly sessions: MailProviderSessions;
    readonly tasks: JiraTaskSink;
    readonly arrivals: SyncArrivalListener;
    readonly replayer: ProviderOpReplayer;
  },
): SyncComponents => {
  const { repositories, unitOfWork, idGenerator: ids, clock, logger } = deps;
  const options = { ...DEFAULT_SYNC_OPTIONS, ...deps.options.sync };
  const keywordLabels = new KeywordLabels(ids);
  const reporter = new SyncReporter(repositories.accounts, shared.events);
  const flusher = new ChangeFlusher({
    unitOfWork,
    pendingWork: repositories.pendingWork,
    messages: repositories.messages,
    events: shared.events,
    tasks: shared.tasks,
    logger,
  });
  const ingestor = new MessageIngestor({
    messages: repositories.messages,
    unitOfWork,
    parser: deps.messageParser,
    threadResolver: deps.threadResolver,
    jiraClassifier: deps.jiraClassifier,
    splitMatcher: deps.splitMatcher,
    keywordLabels,
    ids,
  });
  const fetcher = new NewMessageFetcher({
    ingestor,
    flusher,
    syncStates: repositories.syncStates,
    reporter,
    clock,
    logger,
    options,
  });
  const reconciler = new MailboxReconciler({
    messages: repositories.messages,
    syncStates: repositories.syncStates,
    unitOfWork,
    keywordLabels,
  });
  const mailboxSync = new MailboxSynchronizer({
    mailboxes: repositories.mailboxes,
    syncStates: repositories.syncStates,
    reconciler,
    fetcher,
    clock,
  });
  const refresher = new MailboxRefresher({
    mailboxes: repositories.mailboxes,
    messages: repositories.messages,
    syncStates: repositories.syncStates,
    unitOfWork,
    ids,
  });
  const synchronizer = new AccountSynchronizer({
    splits: repositories.splits,
    pendingWork: repositories.pendingWork,
    sessions: shared.sessions,
    refresher,
    mailboxSync,
    flusher,
    replayer: shared.replayer,
    reporter,
    arrivals: shared.arrivals,
    clock,
    logger,
    options,
  });
  const service = new SyncService({
    accounts: repositories.accounts,
    mailboxes: repositories.mailboxes,
    synchronizer,
    sessions: shared.sessions,
    logger,
  });
  return { service, ingestor, flusher };
};
