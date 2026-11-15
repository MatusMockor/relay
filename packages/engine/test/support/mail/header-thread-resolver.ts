import type { AccountId } from '@relay/shared/domain';
import type {
  IdGenerator,
  MessageRepository,
  ParsedMessage,
  ThreadResolution,
  ThreadResolver,
} from '../../../src';

export class HeaderThreadResolver implements ThreadResolver {
  constructor(
    private readonly messages: MessageRepository,
    private readonly ids: IdGenerator,
  ) {}

  async resolve(accountId: AccountId, message: ParsedMessage): Promise<ThreadResolution> {
    const related = [
      ...message.references,
      ...(message.inReplyTo === null ? [] : [message.inReplyTo]),
      ...(message.messageIdHeader === null ? [] : [message.messageIdHeader]),
    ];
    const known =
      related.length === 0 ? [] : await this.messages.findByMessageIdHeaders(accountId, related);
    const match = known[0];
    if (match !== undefined) {
      return { threadId: match.threadId, isNew: false };
    }
    return { threadId: this.ids.generate('thread'), isNew: true };
  }
}
