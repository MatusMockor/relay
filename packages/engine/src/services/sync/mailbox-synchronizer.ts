import type { Mailbox, MailboxRole } from '@relay/shared/domain';
import type { RemoteMailboxStatus } from '../../model/remote-mail';
import type { MailboxSyncState } from '../../model/sync-state';
import type { Clock } from '../../ports/clock';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { SyncStateRepository } from '../../ports/sync-state-repository';
import { completedSyncState } from './completed-sync-state';
import type { IncrementalMessageFetcher } from './incremental-message-fetcher';
import type { MailboxReconciler } from './mailbox-reconciler';
import type { SyncContext } from './sync-context';

export interface MailboxPass {
  readonly mailbox: Mailbox;
  readonly role: MailboxRole;
  readonly state: MailboxSyncState | null;
  readonly status: RemoteMailboxStatus;
}

export interface MailboxSynchronizerDeps {
  readonly mailboxes: MailboxRepository;
  readonly syncStates: SyncStateRepository;
  readonly reconciler: MailboxReconciler;
  readonly incremental: IncrementalMessageFetcher;
  readonly clock: Clock;
}

export class MailboxSynchronizer {
  constructor(private readonly deps: MailboxSynchronizerDeps) {}

  async fetch(context: SyncContext, mailbox: Mailbox, role: MailboxRole): Promise<MailboxPass> {
    const status = await context.provider.status(mailbox.path);
    const stored = await this.deps.syncStates.find(mailbox.id);
    const reset = stored !== null && stored.uidValidity !== status.uidValidity;
    if (reset) {
      await this.deps.reconciler.reset(context, mailbox, role);
    }
    const pass: MailboxPass = { mailbox, role, state: reset ? null : stored, status };
    const completed = completedSyncState(pass.state);
    if (completed !== null) {
      await this.deps.incremental.fetch(context, pass, completed);
    }
    await this.deps.mailboxes.updateCounts(mailbox.id, {
      unreadCount: status.unseen,
      totalCount: status.messages,
    });
    return pass;
  }

  async reconcile(context: SyncContext, pass: MailboxPass): Promise<void> {
    const state = completedSyncState(pass.state);
    if (state === null) {
      return;
    }
    await this.deps.reconciler.expunges(context, pass.mailbox, pass.role);
    await this.deps.reconciler.flagChanges(context, pass.mailbox, state, pass.status);
    const current = await this.deps.syncStates.find(pass.mailbox.id);
    if (current === null) {
      return;
    }
    await this.deps.syncStates.save({
      ...current,
      highestModseq: pass.status.highestModseq,
      syncedAt: this.deps.clock.now().toISOString(),
    });
  }
}
