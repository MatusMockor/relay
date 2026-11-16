import type { AccountId, MailAccount, Mailbox, MailboxRole, UserId } from '@relay/shared/domain';
import { UidValidityChangedError } from '../../errors';
import type { PendingWork } from '../../model/pending-work';
import type { Clock } from '../../ports/clock';
import type { ProviderOpReplayer } from '../actions/provider-op-replayer';
import type { Logger } from '../../ports/logger';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { SplitRepository } from '../../ports/split-repository';
import { errorMessage, type MailProviderSessions } from '../shared/mail-provider-sessions';
import type { ChangeFlusher } from './change-flusher';
import type { MailboxRefresher } from './mailbox-refresher';
import type { MailboxPass, MailboxSynchronizer } from './mailbox-synchronizer';
import type { SyncBackfill } from './sync-backfill';
import type { InboxArrival, SyncArrivalBatch, SyncArrivalListener } from './sync-arrivals';
import type { SyncContext, SyncStats } from './sync-context';
import type { SyncOptions } from './sync-options';
import type { SyncReporter } from './sync-reporter';
import { SyncJournal } from './sync-journal';

export interface SyncReport {
  readonly accountId: AccountId;
  readonly ok: boolean;
  readonly error: string | null;
  readonly newMessages: number;
  readonly updatedThreads: number;
}

export interface AccountSynchronizerDeps {
  readonly splits: SplitRepository;
  readonly pendingWork: PendingWorkRepository;
  readonly sessions: MailProviderSessions;
  readonly refresher: MailboxRefresher;
  readonly mailboxSync: MailboxSynchronizer;
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
    const selected = this.select(mailboxes);
    await this.deps.reporter.progress(context.userId, context.account.id, {
      mailboxId: null,
      phase: 'mailboxes',
      processed: selected.length,
      total: mailboxes.length,
    });
    const passes = [];
    for (const [mailbox, role] of selected) {
      const pass = await this.fetchPass(context, mailbox, role);
      if (pass !== null) {
        passes.push(pass);
      }
    }
    for (const pass of passes) {
      await this.deps.mailboxSync.reconcile(context, pass);
    }
    await this.deps.backfill.run(context, mailboxes);
    await this.deps.flusher.flush(context);
    await this.deps.replayer.replayPending(context.account, context.provider);
  }

  private async fetchPass(
    context: SyncContext,
    mailbox: Mailbox,
    role: MailboxRole,
  ): Promise<MailboxPass | null> {
    try {
      return await this.deps.mailboxSync.fetch(context, mailbox, role);
    } catch (error) {
      if (!(error instanceof UidValidityChangedError)) {
        throw error;
      }
      this.deps.logger.warn('Mailbox UIDVALIDITY changed during the sync, retrying next time', {
        accountId: context.account.id,
        mailboxId: mailbox.id,
      });
      return null;
    }
  }

  private select(mailboxes: readonly Mailbox[]): [Mailbox, MailboxRole][] {
    return this.deps.options.mailboxRoles.flatMap((role) =>
      mailboxes
        .filter((mailbox) => mailbox.role === role)
        .map((mailbox): [Mailbox, MailboxRole] => [mailbox, role]),
    );
  }
}
