import type { AccountId, ThreadId } from '@relay/shared/domain';
import {
  type IdGenerator,
  type MessageRepository,
  type ParsedMessage,
  subjectFallbackWindow,
  type ThreadResolution,
  type ThreadResolver,
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
    const match = known[0]?.threadId ?? (await this.bySubject(accountId, message));
    if (match !== null) {
      return { threadId: match, isNew: false };
    }
    return { threadId: this.ids.generate('thread'), isNew: true };
  }

  private bySubject(accountId: AccountId, message: ParsedMessage): Promise<ThreadId | null> {
    const window = subjectFallbackWindow({
      subject: message.subject,
      date: message.date,
      hasReplyHeaders: message.inReplyTo !== null || message.references.length > 0,
    });
    if (window === null) {
      return Promise.resolve(null);
    }
    return this.messages.findThreadIdBySubject(accountId, window.normalizedSubject, window);
  }
}
