import type { Message } from '@relay/shared/domain';
import type { MessageRepository } from '../../ports/message-repository';

export const MAX_BODY_COPIES = 3;

export class MessageCopyFinder {
  constructor(private readonly messages: MessageRepository) {}

  async otherCopies(message: Message): Promise<Message[]> {
    if (message.messageIdHeader === null) {
      return [];
    }
    const found = await this.messages.findByMessageIdHeaders(message.accountId, [
      message.messageIdHeader,
    ]);
    const unique = new Map(
      found.filter((copy) => copy.id !== message.id).map((copy) => [copy.id, copy]),
    );
    return [...unique.values()];
  }
}
