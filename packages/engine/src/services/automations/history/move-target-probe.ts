import type { LabelId, MailboxId, MailboxRole, ThreadSummary, UserId } from '@relay/shared/domain';
import type { LabelRepository } from '../../../ports/label-repository';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { MessageRepository } from '../../../ports/message-repository';

export interface LocatedMoveTarget {
  readonly role: MailboxRole;
  readonly labelId: LabelId | null;
}

export class MoveTargetProbe {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly labels: LabelRepository,
    private readonly messages: MessageRepository,
  ) {}

  async locate(
    userId: UserId,
    thread: ThreadSummary,
    mailboxId: MailboxId,
  ): Promise<LocatedMoveTarget | null> {
    const mailbox = await this.mailboxes.findById(mailboxId);
    if (mailbox === null || mailbox.accountId !== thread.accountId) {
      return null;
    }
    if (mailbox.role === 'label') {
      const label = await this.labels.findByRemoteName(thread.accountId, 'gmail', mailbox.path);
      return label !== null && thread.labelIds.includes(label.id)
        ? { role: mailbox.role, labelId: label.id }
        : null;
    }
    const messages = await this.messages.listByThread(userId, thread.id);
    return messages.some((message) => message.mailboxId === mailboxId)
      ? { role: mailbox.role, labelId: null }
      : null;
  }
}
