import type { Mailbox, MailboxId } from '@relay/shared/domain';
import type { RemoteMailboxStatus } from '../../model/remote-mail';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { MailboxEvents } from './mailbox-events';
import type { MailboxStatusProbe } from './mailbox-status-probe';
import type { SyncContext } from './sync-context';

export interface DeferredStatusProbeDeps {
  readonly mailboxes: MailboxRepository;
  readonly probe: MailboxStatusProbe;
  readonly events: MailboxEvents;
}

const countsDiffer = (mailbox: Mailbox, status: RemoteMailboxStatus): boolean =>
  mailbox.unreadCount !== status.unseen || mailbox.totalCount !== status.messages;

export class DeferredStatusProbe {
  constructor(private readonly deps: DeferredStatusProbeDeps) {}

  async settle(
    context: SyncContext,
    mailboxes: readonly Mailbox[],
    opened: ReadonlySet<MailboxId>,
  ): Promise<void> {
    const pending = mailboxes.filter(
      (mailbox) => mailbox.uidValidity === null && !opened.has(mailbox.id),
    );
    if (pending.length === 0) {
      return;
    }
    const statuses = await this.deps.probe.probe(
      context,
      pending.map((mailbox) => mailbox.path),
    );
    let changed = false;
    for (const mailbox of pending) {
      const status = statuses.get(mailbox.path);
      if (status === undefined) {
        continue;
      }
      await this.deps.mailboxes.updateCounts(mailbox.id, {
        unreadCount: status.unseen,
        totalCount: status.messages,
      });
      await this.deps.mailboxes.saveUidValidity(mailbox.id, status.uidValidity);
      changed = changed || countsDiffer(mailbox, status);
    }
    if (changed) {
      await this.deps.events.mailboxesChanged(context);
    }
  }
}
