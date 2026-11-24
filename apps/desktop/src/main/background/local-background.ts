import type { Clock, EvictionReport, HistorySliceReport, Logger } from '@relay/engine';
import type { AccountId, MailAccount } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from '../events/event-hub';
import type { PowerEvents } from '../platform/power-events';
import type { Timers } from '../platform/timers';
import { AccountSyncScheduler } from './account-sync-scheduler';
import { type DueJob, DueWorkTicker } from './due-work-ticker';
import { HistoryBackfillScheduler } from './history-backfill-scheduler';
import type { HistoryCadence, HistoryLoopState } from './history/history-cadence';
import { IdleSupervisor } from './idle-supervisor';
import { IdleWorker } from './idle-worker';
import type { MailboxWatcher } from './mailbox-watcher';
import { OfflineWindowReactor, type OfflineWindowSettings } from './offline-window-reactor';
import { PowerAwareLifecycle } from './power-aware-lifecycle';

export interface LocalBackgroundDeps {
  readonly listAccounts: () => Promise<readonly MailAccount[]>;
  readonly syncAccount: (accountId: AccountId) => Promise<void>;
  readonly backfillHistory: (accountId: AccountId) => Promise<HistorySliceReport>;
  readonly onHistoryState?: (accountId: AccountId, state: HistoryLoopState) => void;
  readonly historyCadence?: Partial<HistoryCadence>;
  readonly watcher: MailboxWatcher;
  readonly dueJobs: readonly DueJob[];
  readonly hub: EventHub<RealtimeEvent>;
  readonly power: PowerEvents;
  readonly timers: Timers;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly dueIntervalMs?: number;
  readonly offlineWindow?: OfflineWindowBackgroundDeps;
}

export interface OfflineWindowBackgroundDeps {
  readonly settings: OfflineWindowSettings;
  readonly evict: () => Promise<EvictionReport>;
}

const ACCOUNT_EVENTS = new Set<RealtimeEvent['type']>([
  'account.upserted',
  'account.removed',
  'account.status',
]);

const isWatchable = (account: MailAccount): boolean =>
  account.status === 'connected' || account.status === 'syncing';

export interface LocalBackground {
  readonly lifecycle: PowerAwareLifecycle;
  readonly scheduler: AccountSyncScheduler;
  readonly history: HistoryBackfillScheduler;
  readonly ticker: DueWorkTicker;
  readonly offlineWindow: OfflineWindowReactor | null;
  start(): Promise<void>;
  shutdown(): Promise<void>;
}

export const createLocalBackground = (deps: LocalBackgroundDeps): LocalBackground => {
  const logger = deps.logger.child({ component: 'background' });
  const scheduler = new AccountSyncScheduler({
    listAccounts: deps.listAccounts,
    syncAccount: deps.syncAccount,
    timers: deps.timers,
    logger,
  });
  const history = new HistoryBackfillScheduler({
    listAccounts: deps.listAccounts,
    backfill: deps.backfillHistory,
    timers: deps.timers,
    clock: deps.clock,
    logger: logger.child({ worker: 'history' }),
    ...(deps.historyCadence === undefined ? {} : { cadence: deps.historyCadence }),
    ...(deps.onHistoryState === undefined ? {} : { onState: deps.onHistoryState }),
  });
  const idle = new IdleWorker(
    new IdleSupervisor({ watcher: deps.watcher, timers: deps.timers, logger }),
    async () => (await deps.listAccounts()).filter(isWatchable).map((account) => account.id),
  );
  const ticker = new DueWorkTicker({
    jobs: deps.dueJobs,
    intervalMs: deps.dueIntervalMs ?? 30_000,
    timers: deps.timers,
    logger,
  });
  const offlineWindow =
    deps.offlineWindow === undefined
      ? null
      : new OfflineWindowReactor({
          ...deps.offlineWindow,
          kick: () => {
            history.kick();
          },
          timers: deps.timers,
          logger: logger.child({ worker: 'offline-window' }),
        });
  const workers = [
    scheduler,
    idle,
    ticker,
    history,
    ...(offlineWindow === null ? [] : [offlineWindow]),
  ];
  const lifecycle = new PowerAwareLifecycle(workers, deps.power, logger);
  let unsubscribe: (() => void) | null = null;
  const reconcile = () => {
    Promise.all([scheduler.reconcile(), idle.reconcile(), history.reconcile()]).catch(
      (error: unknown) => {
        logger.warn('Failed to reconcile background work', { error });
      },
    );
  };
  return {
    lifecycle,
    scheduler,
    history,
    ticker,
    offlineWindow,
    start: async () => {
      unsubscribe ??= deps.hub.subscribe((event) => {
        if (ACCOUNT_EVENTS.has(event.type)) {
          reconcile();
        }
      });
      await lifecycle.start();
    },
    shutdown: async () => {
      unsubscribe?.();
      unsubscribe = null;
      await lifecycle.shutdown();
    },
  };
};
