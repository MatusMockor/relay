import type { Logger } from '@relay/engine';
import type { AccountId, MailAccount } from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';
import type { EventHub } from '../events/event-hub';
import type { PowerEvents } from '../platform/power-events';
import type { Timers } from '../platform/timers';
import { AccountSyncScheduler } from './account-sync-scheduler';
import { type DueJob, DueWorkTicker } from './due-work-ticker';
import { IdleSupervisor } from './idle-supervisor';
import { IdleWorker } from './idle-worker';
import type { MailboxWatcher } from './mailbox-watcher';
import { PowerAwareLifecycle } from './power-aware-lifecycle';

export interface LocalBackgroundDeps {
  readonly listAccounts: () => Promise<readonly MailAccount[]>;
  readonly syncAccount: (accountId: AccountId) => Promise<void>;
  readonly watcher: MailboxWatcher;
  readonly dueJobs: readonly DueJob[];
  readonly hub: EventHub<RealtimeEvent>;
  readonly power: PowerEvents;
  readonly timers: Timers;
  readonly logger: Logger;
  readonly dueIntervalMs?: number;
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
  readonly ticker: DueWorkTicker;
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
  const lifecycle = new PowerAwareLifecycle([scheduler, idle, ticker], deps.power, logger);
  let unsubscribe: (() => void) | null = null;
  const reconcile = () => {
    Promise.all([scheduler.reconcile(), idle.reconcile()]).catch((error: unknown) => {
      logger.warn('Failed to reconcile background work', { error });
    });
  };
  return {
    lifecycle,
    scheduler,
    ticker,
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
