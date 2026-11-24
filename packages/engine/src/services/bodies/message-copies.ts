import type { Message } from '@relay/shared/domain';
import type { MessageRepository } from '../../ports/message-repository';

export const MAX_BODY_COPIES = 3;

export class MessageCopyFinder {
  constructor(private readonly messages: MessageRepository) {}

  async otherCopies(message: Message): Promise<Message[]> {
    const byEmailId = await this.byEmailId(message);
    const found = byEmailId.length > 0 ? byEmailId : await this.byMessageIdHeader(message);
    const unique = new Map(
      found.filter((copy) => copy.id !== message.id).map((copy) => [copy.id, copy]),
    );
    return [...unique.values()];
  }

  private byEmailId(message: Message): Promise<Message[]> {
    if (message.emailId === null) {
      return Promise.resolve([]);
    }
    return this.messages.findByEmailId(message.accountId, message.emailId);
  }

  private byMessageIdHeader(message: Message): Promise<Message[]> {
    if (message.messageIdHeader === null) {
      return Promise.resolve([]);
    }
    return this.messages.findByMessageIdHeaders(message.accountId, [message.messageIdHeader]);
  }
}
