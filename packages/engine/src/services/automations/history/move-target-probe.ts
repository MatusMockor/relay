import {
  isPlacedIn,
  type LabelId,
  type MailboxId,
  type MailboxRole,
  type Message,
  type MessageId,
  type ThreadSummary,
  type UserId,
} from '@relay/shared/domain';
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
    return messages.some((message) => isPlacedIn(message, mailboxId))
      ? { role: mailbox.role, labelId: null }
      : null;
  }

  async recordedIn(
    userId: UserId,
    thread: ThreadSummary,
    recorded: readonly MessageId[],
    roles: readonly MailboxRole[],
  ): Promise<MessageId[]> {
    const wanted = new Set<string>(recorded);
    const found: MessageId[] = [];
    for (const message of await this.messages.listByThread(userId, thread.id)) {
      if (wanted.has(message.id) && (await this.placedInRole(message, roles))) {
        found.push(message.id);
      }
    }
    return found;
  }

  private async placedInRole(message: Message, roles: readonly MailboxRole[]): Promise<boolean> {
    for (const { mailboxId } of message.placements) {
      const role = (await this.mailboxes.findById(mailboxId))?.role;
      if (role !== undefined && roles.includes(role)) {
        return true;
      }
    }
    return false;
  }
}
