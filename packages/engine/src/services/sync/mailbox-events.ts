import type { LabelRepository } from '../../ports/label-repository';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { EngineEvents } from '../shared/engine-events';
import type { SyncContext } from './sync-context';

export interface MailboxEventsDeps {
  readonly mailboxes: MailboxRepository;
  readonly labels: LabelRepository;
  readonly events: EngineEvents;
}

export class MailboxEvents {
  constructor(private readonly deps: MailboxEventsDeps) {}

  async mailboxesChanged(context: SyncContext): Promise<void> {
    const { userId, account } = context;
    const mailboxes = await this.deps.mailboxes.listByAccount(userId, account.id);
    await this.deps.events.emit(userId, 'mailboxes.updated', { accountId: account.id, mailboxes });
  }

  async labelsChanged(context: SyncContext): Promise<void> {
    const { userId, account } = context;
    const labels = await this.deps.labels.list(userId, account.id);
    await this.deps.events.emit(userId, 'labels.updated', { accountId: account.id, labels });
  }
}
