import type { AccountId, UserId } from '@relay/shared/domain';
import type { LabelRepository } from '../../ports/label-repository';
import type { MailboxRepository } from '../../ports/mailbox-repository';
import type { EngineEvents } from '../shared/engine-events';

export interface LabelAnnouncerDeps {
  readonly labels: LabelRepository;
  readonly mailboxes: MailboxRepository;
  readonly events: EngineEvents;
}

export class LabelAnnouncer {
  constructor(private readonly deps: LabelAnnouncerDeps) {}

  async announce(userId: UserId, accountId: AccountId, mailboxes: boolean): Promise<void> {
    const labels = await this.deps.labels.list(userId, accountId);
    await this.deps.events.emit(userId, 'labels.updated', { accountId, labels });
    if (!mailboxes) {
      return;
    }
    const list = await this.deps.mailboxes.listByAccount(userId, accountId);
    await this.deps.events.emit(userId, 'mailboxes.updated', { accountId, mailboxes: list });
  }
}
