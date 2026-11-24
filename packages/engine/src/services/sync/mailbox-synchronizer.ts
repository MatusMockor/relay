import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import { completedSyncState } from './completed-sync-state';
import type { IncrementalMessageFetcher } from './incremental-message-fetcher';
import type { MailboxPass } from './mailbox-pass';
import type { MailboxReconciler } from './mailbox-reconciler';
import type { SyncContext } from './sync-context';

export type { MailboxPass } from './mailbox-pass';

export interface MailboxSynchronizerDeps {
  readonly mailboxes: MailboxRepository;
  readonly syncStates: SyncStateRepository;
  readonly reconciler: MailboxReconciler;
  readonly incremental: IncrementalMessageFetcher;
  readonly clock: Clock;
}

export class MailboxSynchronizer {
  constructor(private readonly deps: MailboxSynchronizerDeps) {}

  async open(context: SyncContext, mailbox: Mailbox, role: MailboxRole): Promise<MailboxPass> {
    const status = await context.provider.status(mailbox.path);
    const stored = await this.deps.syncStates.find(mailbox.id);
    const reset = stored !== null && stored.uidValidity !== status.uidValidity;
    if (reset) {
      await this.deps.reconciler.reset(context, mailbox, role);
    }
    if (mailbox.uidValidity !== status.uidValidity) {
      await this.deps.mailboxes.saveUidValidity(mailbox.id, status.uidValidity);
    }
    await this.deps.mailboxes.updateCounts(mailbox.id, {
      unreadCount: status.unseen,
      totalCount: status.messages,
    });
    return { mailbox, role, state: reset ? null : stored, status };
  }

  async fetch(context: SyncContext, pass: MailboxPass, holdCalendar: boolean): Promise<void> {
    const completed = completedSyncState(pass.state);
    if (completed === null) {
      return;
    }
    await this.deps.incremental.fetch(context, pass, completed, holdCalendar);
  }

  async reconcile(context: SyncContext, pass: MailboxPass, rescanLabels: boolean): Promise<void> {
    const state = completedSyncState(pass.state);
    if (state === null) {
      return;
    }
    await this.deps.reconciler.expunges(context, pass);
    await this.deps.reconciler.flagChanges(context, pass, state, rescanLabels);
    const current = await this.deps.syncStates.find(pass.mailbox.id);
    if (current === null) {
      return;
    }
    await this.deps.syncStates.save({
      ...current,
      highestModseq: pass.status.highestModseq,
      uidNext: pass.status.uidNext,
      messageCount: pass.status.messages,
      syncedAt: this.deps.clock.now().toISOString(),
    });
  }
}
