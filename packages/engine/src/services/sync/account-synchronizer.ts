import type { AccountId, MailAccount, UserId } from '@relay/shared/domain';
import type { PendingWork } from '../../model/pending-work';
import type { Clock } from '../../ports/clock';
import type { ProviderOpReplayer } from '../actions/provider-op-replayer';
import type { Logger } from '../../ports/logger';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { SplitRepository } from '../../ports/split-repository';
import type { SplitSnapshotGuard } from '../splits/split-snapshot-guard';
import { errorMessage, type MailProviderSessions } from '../shared/mail-provider-sessions';
import type { ChangeFlusher } from './change-flusher';
import { completedSyncState } from './completed-sync-state';
import type { DeferredStatusProbe } from './deferred-status-probe';
import type { InitialSync } from './initial-sync';
import type { LabelRescans } from './label-rescans';
import type { MailboxEvents } from './mailbox-events';
import { countsChanged, unchangedSince } from './mailbox-pass';
import type { MailboxRefresher } from './mailbox-refresher';
import { selectMailboxes } from './mailbox-selection';
import type { MailboxPass, MailboxSynchronizer } from './mailbox-synchronizer';
import type { ReconcileScans } from './reconcile-scans';
import type { SyncBackfill } from './sync-backfill';
import type { InboxArrival, SyncArrivalBatch, SyncArrivalListener } from './sync-arrivals';
import type { SyncContext, SyncStats } from './sync-context';
import type { SyncOptions } from './sync-options';
import type { SyncReporter } from './sync-reporter';
import { SyncJournal } from './sync-journal';
import { skipOnUidValidityChange } from './uid-validity-guard';

export interface SyncReport {
  readonly accountId: AccountId;
  readonly ok: boolean;
  readonly error: string | null;
  readonly newMessages: number;
  readonly updatedThreads: number;
}

export interface AccountSynchronizerDeps {
  readonly splits: SplitRepository;
  readonly splitGuard: SplitSnapshotGuard;
  readonly pendingWork: PendingWorkRepository;
  readonly sessions: MailProviderSessions;
  readonly refresher: MailboxRefresher;
  readonly deferredStatuses: DeferredStatusProbe;
  readonly rescans: LabelRescans;
  readonly mailboxEvents: MailboxEvents;
  readonly mailboxSync: MailboxSynchronizer;
  readonly scans: ReconcileScans;
  readonly initialSync: InitialSync;
  readonly flusher: ChangeFlusher;
  readonly backfill: SyncBackfill;
  readonly replayer: ProviderOpReplayer;
  readonly reporter: SyncReporter;
  readonly arrivals: SyncArrivalListener;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly options: SyncOptions;
}

export class AccountSynchronizer {
  constructor(private readonly deps: AccountSynchronizerDeps) {}

  async run(userId: UserId, account: MailAccount): Promise<SyncReport> {
    const stats: SyncStats = { newMessages: 0, updatedThreads: 0 };
    const arrivals: InboxArrival[] = [];
    const arrivalWork: PendingWork<'message-effects'>[] = [];
    const startedAt = this.deps.clock.now().toISOString();
    const { reporter } = this.deps;
    await reporter.status(userId, account.id, 'syncing', {
      error: null,
      lastSyncedAt: account.lastSyncedAt,
    });
    await reporter.progress(userId, account.id, {
      mailboxId: null,
      phase: 'connecting',
      processed: 0,
      total: null,
    });
    try {
      await this.deps.sessions.with(account, (provider) =>
        this.syncMailboxes({
          userId,
          account,
          provider,
          splits: [],
          mailboxRoles: new Map(),
          journal: new SyncJournal(account.id, this.deps.clock),
          stats,
          arrivals,
          arrivalWork,
        }),
      );
    } catch (error) {
      const message = errorMessage(error);
      this.deps.logger.error('Account sync failed', { accountId: account.id, error: message });
      await reporter.status(userId, account.id, 'error', {
        error: message,
        lastSyncedAt: account.lastSyncedAt,
      });
      return { accountId: account.id, ok: false, error: message, ...stats };
    }
    await this.deps.replayer.expireKeywordPurges(account.id, startedAt);
    const syncedAt = this.deps.clock.now().toISOString();
    await reporter.status(userId, account.id, 'connected', { error: null, lastSyncedAt: syncedAt });
    await reporter.progress(userId, account.id, {
      mailboxId: null,
      phase: 'idle',
      processed: stats.newMessages,
      total: null,
    });
    await this.notifyArrivals({ userId, account, startedAt, arrivals }, arrivalWork);
    return { accountId: account.id, ok: true, error: null, ...stats };
  }

  private async notifyArrivals(
    batch: SyncArrivalBatch,
    work: readonly PendingWork<'message-effects'>[],
  ): Promise<void> {
    try {
      await this.deps.arrivals.onArrivals(batch);
      await this.deps.pendingWork.remove(work);
    } catch (error) {
      this.deps.logger.warn('Handling new inbox mail failed', {
        accountId: batch.account.id,
        error: errorMessage(error),
      });
    }
  }

  private async syncMailboxes(base: SyncContext): Promise<void> {
    const splits = await this.deps.splits.listForAccount(base.userId, base.account.id);
    const context: SyncContext = { ...base, splits };
    const mailboxes = await this.deps.refresher.refresh(context);
    await this.deps.replayer.replayPending(context.account, context.provider);
    await this.deps.flusher.flush(context);
    const selected = selectMailboxes(mailboxes, this.deps.options);
    await this.deps.reporter.progress(context.userId, context.account.id, {
      mailboxId: null,
      phase: 'mailboxes',
      processed: selected.length,
      total: mailboxes.length,
    });
    const passes: MailboxPass[] = [];
    for (const [mailbox, role] of selected) {
      passes.push(await this.deps.mailboxSync.open(context, mailbox, role));
    }
    if (passes.some(countsChanged)) {
      await this.deps.mailboxEvents.mailboxesChanged(context);
    }
    const rescans = await this.deps.rescans.pending(context.account.id);
    const incremental = passes.filter(
      (pass) =>
        completedSyncState(pass.state) !== null &&
        (rescans.has(pass.mailbox.id) ||
          !unchangedSince(pass) ||
          this.deps.scans.fullExpungeDiffDue(pass.mailbox.id)),
    );
    const fetched = await this.fetchIncremental(context, incremental, {
      holdCalendar: await this.deps.initialSync.holdsCalendar(context, passes),
    });
    await this.deps.initialSync.run(context, {
      passes,
      skipped: fetched.length < incremental.length,
    });
    for (const pass of fetched) {
      const rescan = rescans.get(pass.mailbox.id);
      await this.deps.mailboxSync.reconcile(context, pass, rescan !== undefined);
      if (rescan !== undefined) {
        await this.deps.rescans.done(rescan);
      }
    }
    const opened = new Set(passes.map((pass) => pass.mailbox.id));
    await this.deps.deferredStatuses.settle(context, mailboxes, opened);
    await this.deps.backfill.run(context, mailboxes);
    await this.deps.flusher.flush(context);
    await this.deps.replayer.replayPending(context.account, context.provider);
    await this.deps.splitGuard.settle(context.userId, context.account.id, splits);
  }

  private async fetchIncremental(
    context: SyncContext,
    passes: readonly MailboxPass[],
    mode: { readonly holdCalendar: boolean },
  ): Promise<MailboxPass[]> {
    const fetched: MailboxPass[] = [];
    for (const pass of passes) {
      const done = await skipOnUidValidityChange(this.deps.logger, context, pass.mailbox, () =>
        this.deps.mailboxSync.fetch(context, pass, mode.holdCalendar).then(() => pass),
      );
      if (done !== null) {
        fetched.push(done);
      }
    }
    return fetched;
  }
}
