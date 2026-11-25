import type { MailAccount, Message } from '@relay/shared/domain';
import type { MessageRepository } from '../../ports/message-repository';
import { labelsMessages, MailCopies } from '../shared/mail-copies';

export const MAX_BODY_COPIES = 3;

export class MessageCopyFinder {
  constructor(private readonly messages: MessageRepository) {}

  async otherCopies(account: MailAccount, message: Message): Promise<Message[]> {
    const found = [...(await this.byHeader(message)), ...(await this.byEmailId(account, message))];
    const copies = MailCopies.of(account);
    const donors = found.filter(
      (copy) => copy.id !== message.id && copies.sharesBody(message, copy),
    );
    const unique = new Map(donors.map((copy) => [copy.id, copy]));
    return [...unique.values()];
  }

  private async byHeader(message: Message): Promise<Message[]> {
    if (message.messageIdHeader === null) {
      return [];
    }
    return this.messages.findByMessageIdHeaders(message.accountId, [message.messageIdHeader]);
  }

  private async byEmailId(account: MailAccount, message: Message): Promise<Message[]> {
    if (message.emailId === null || !labelsMessages(account)) {
      return [];
    }
    return this.messages.findByEmailId(message.accountId, message.emailId);
  }
}
