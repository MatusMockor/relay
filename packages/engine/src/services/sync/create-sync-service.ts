import type { EngineDeps } from '../../engine-deps';
import type { ProviderOpReplayer } from '../actions/provider-op-replayer';
import type { EngineEvents } from '../shared/engine-events';
import type { MailProviderSessions } from '../shared/mail-provider-sessions';
import { SplitMembershipEvaluator } from '../splits/split-membership-evaluator';
import { SplitSnapshotGuard } from '../splits/split-snapshot-guard';
import { AccountRunQueue } from './account-run-queue';
import { AccountSynchronizer, type SyncReport } from './account-synchronizer';
import { ChangeFlusher } from './change-flusher';
import { createMessageFetchers } from './create-message-fetchers';
import type { CalendarPartsSink } from './calendar-parts-sink';
import type { JiraTaskSink } from './jira-task-sink';
import type { SyncArrivalListener } from './sync-arrivals';
import type { SyncBackfill } from './sync-backfill';
import { GmailLabelCatalog } from './gmail-label-catalog';
import { createHistoryBackfill, createHistoryProgress } from './history/create-history-backfill';
import { LabelRescans } from './label-rescans';
import { MailboxEvents } from './mailbox-events';
import { MailboxForgetter } from './mailbox-forgetter';
import { MailboxReconciler } from './mailbox-reconciler';
import { ReconcileScans } from './reconcile-scans';
import { MailboxRefresher } from './mailbox-refresher';
import { MailboxStatusProbe } from './mailbox-status-probe';
import { DeferredStatusProbe } from './deferred-status-probe';
import { MailboxSynchronizer } from './mailbox-synchronizer';
import { MessageIngestor } from './message-ingestor';
import { MessageLabelsResolver } from './message-labels-resolver';
import { remoteBodyFill } from './create-remote-body-fill';
import { DEFAULT_SYNC_OPTIONS, type SyncOptions } from './sync-options';
import { SyncReporter } from './sync-reporter';
import { SyncService } from './sync-service';

export interface SyncComponents {
  readonly service: SyncService;
  readonly ingestor: MessageIngestor;
  readonly flusher: ChangeFlusher;
  readonly runs: AccountRunQueue<SyncReport>;
  readonly options: SyncOptions;
}

export const createSyncComponents = (
  deps: EngineDeps,
  shared: {
    readonly calendarParts: CalendarPartsSink;
    readonly backfill: SyncBackfill;
    readonly events: EngineEvents;
    readonly sessions: MailProviderSessions;
    readonly tasks: JiraTaskSink;
    readonly arrivals: SyncArrivalListener;
    readonly replayer: ProviderOpReplayer;
  },
): SyncComponents => {
  const { repositories, unitOfWork, idGenerator: ids, clock, logger } = deps;
  const options = { ...DEFAULT_SYNC_OPTIONS, ...deps.options.sync };
  const labelsResolver = new MessageLabelsResolver(ids);
  const reporter = new SyncReporter(repositories.accounts, shared.events);
  const flusher = new ChangeFlusher({
    unitOfWork,
    pendingWork: repositories.pendingWork,
    messages: repositories.messages,
    events: shared.events,
    tasks: shared.tasks,
    calendarParts: shared.calendarParts,
    logger,
  });
  const ingestor = new MessageIngestor({
    messages: repositories.messages,
    unitOfWork,
    parser: deps.messageParser,
    threadResolver: deps.threadResolver,
    jiraClassifier: deps.jiraClassifier,
    splitMatcher: deps.splitMatcher,
    labelsResolver,
    ids,
    calendarParts: shared.calendarParts,
    clock,
    ...remoteBodyFill(deps),
  });
  const fetchers = createMessageFetchers({
    ingestor,
    flusher,
    messages: repositories.messages,
    calendarParts: shared.calendarParts,
    syncStates: repositories.syncStates,
    reporter,
    clock,
    logger,
    options,
  });
  const scans = new ReconcileScans({
    history: deps.historyBackfills ?? null,
    clock,
    options: options.reconcile,
  });
  const reconciler = new MailboxReconciler({
    messages: repositories.messages,
    syncStates: repositories.syncStates,
    unitOfWork,
    labelsResolver,
    scans,
  });
  const mailboxSync = new MailboxSynchronizer({
    mailboxes: repositories.mailboxes,
    syncStates: repositories.syncStates,
    reconciler,
    incremental: fetchers.incremental,
    clock,
  });
  const mailboxEvents = new MailboxEvents({
    mailboxes: repositories.mailboxes,
    labels: repositories.labels,
    events: shared.events,
  });
  const rescans = new LabelRescans({
    pendingWork: repositories.pendingWork,
    syncStates: repositories.syncStates,
    clock,
  });
  const probe = new MailboxStatusProbe(logger);
  const refresher = new MailboxRefresher({
    mailboxes: repositories.mailboxes,
    syncStates: repositories.syncStates,
    forgetter: new MailboxForgetter({
      messages: repositories.messages,
      syncStates: repositories.syncStates,
      unitOfWork,
      rescans,
    }),
    probe,
    catalog: new GmailLabelCatalog({ labels: repositories.labels, rescans, ids, logger }),
    events: mailboxEvents,
    ids,
  });
  const synchronizer = new AccountSynchronizer({
    splits: repositories.splits,
    splitGuard: new SplitSnapshotGuard({
      splits: repositories.splits,
      evaluator: new SplitMembershipEvaluator({
        splits: repositories.splits,
        messages: repositories.messages,
        threads: repositories.threads,
        matcher: deps.splitMatcher,
        unitOfWork,
      }),
      events: shared.events,
    }),
    pendingWork: repositories.pendingWork,
    sessions: shared.sessions,
    refresher,
    deferredStatuses: new DeferredStatusProbe({
      mailboxes: repositories.mailboxes,
      probe,
      events: mailboxEvents,
    }),
    rescans,
    mailboxEvents,
    mailboxSync,
    scans,
    initialSync: fetchers.initialSync,
    flusher,
    backfill: shared.backfill,
    replayer: shared.replayer,
    reporter,
    arrivals: shared.arrivals,
    clock,
    logger,
    options,
  });
  const runs = new AccountRunQueue<SyncReport>();
  const service = new SyncService({
    accounts: repositories.accounts,
    mailboxes: repositories.mailboxes,
    synchronizer,
    sessions: shared.sessions,
    history: createHistoryBackfill(deps, { ingestor, flusher, options }),
    runs,
    historyProgress: createHistoryProgress(deps, options),
    events: shared.events,
    logger,
  });
  return { service, ingestor, flusher, runs, options };
};
