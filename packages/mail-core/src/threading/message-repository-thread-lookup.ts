import type { MessageRepository } from '@relay/engine';
import type { AccountId, ThreadId } from '@relay/shared/domain';
import type { SubjectWindow, ThreadLookup } from './thread-lookup';

export class MessageRepositoryThreadLookup implements ThreadLookup {
  constructor(private readonly messages: MessageRepository) {}

  async findByMessageIds(
    accountId: AccountId,
    messageIds: readonly string[],
  ): Promise<ThreadId | null> {
    if (messageIds.length === 0) {
      return null;
    }
    const found = await this.messages.findByMessageIdHeaders(accountId, messageIds);
    for (const messageId of messageIds) {
      const match = found.find((message) => message.messageIdHeader === messageId);
      if (match) {
        return match.threadId;
      }
    }
    return found[0]?.threadId ?? null;
  }

  findByReplyTo(accountId: AccountId, messageIds: readonly string[]): Promise<ThreadId | null> {
    if (messageIds.length === 0) {
      return Promise.resolve(null);
    }
    return this.messages.findThreadIdByReplyTo(accountId, messageIds);
  }

  findBySubject(accountId: AccountId, window: SubjectWindow): Promise<ThreadId | null> {
    return this.messages.findThreadIdBySubject(accountId, window.normalizedSubject, {
      since: window.since,
      until: window.until,
    });
  }
}
