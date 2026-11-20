import type { AccountId, Message, MessageId, OfflineStats } from '@relay/shared/domain';
import type { HydratedBody, HydrationCandidate, MessageBodyStore } from '../../../src';
import type { MemoryDatabase } from './memory-database';

const PENDING_UID = 0;

const dateOf = (message: Message): number => Date.parse(message.date);

const isRemote = (message: Message): boolean => message.bodyState === 'remote';

export class MemoryMessageBodies implements MessageBodyStore {
  constructor(private readonly db: MemoryDatabase) {}

  saveBody(messageId: MessageId, body: HydratedBody): Promise<boolean> {
    const message = this.db.tables.messages.get(messageId);
    if (message === undefined || !isRemote(message)) {
      return Promise.resolve(false);
    }
    const { bodyState: _bodyState, ...local } = message;
    this.db.tables.messages.set(messageId, {
      ...local,
      textBody: body.textBody,
      htmlBody: body.htmlBody,
      snippet: body.snippet,
      attachments: [...body.attachments],
    });
    return Promise.resolve(true);
  }

  evictBefore(accountId: AccountId, before: Date, limit: number): Promise<number> {
    const due = this.ofAccount(accountId)
      .filter((message) => !isRemote(message) && message.uid !== PENDING_UID)
      .filter((message) => dateOf(message) < before.getTime())
      .slice(0, limit);
    due.forEach((message) => {
      this.db.tables.messages.set(message.id, {
        ...message,
        textBody: null,
        htmlBody: null,
        bodyState: 'remote',
      });
    });
    return Promise.resolve(due.length);
  }

  hydrationCandidates(
    accountId: AccountId,
    since: Date | null,
    limit: number,
    excluding: readonly MessageId[],
  ): Promise<HydrationCandidate[]> {
    const skipped = new Set(excluding);
    const floor = since?.getTime() ?? Number.NEGATIVE_INFINITY;
    const candidates = this.ofAccount(accountId)
      .filter((message) => isRemote(message) && message.uid !== PENDING_UID)
      .filter((message) => dateOf(message) >= floor && !skipped.has(message.id))
      .sort((left, right) => dateOf(right) - dateOf(left))
      .slice(0, limit)
      .map((message) => ({
        messageId: message.id,
        threadId: message.threadId,
        mailboxId: message.mailboxId,
        uid: message.uid,
        messageIdHeader: message.messageIdHeader,
        snippet: message.snippet,
        attachments: message.attachments,
      }));
    return Promise.resolve(candidates);
  }

  stats(accountId: AccountId): Promise<OfflineStats> {
    const messages = this.ofAccount(accountId);
    const remote = messages.filter(isRemote).length;
    return Promise.resolve({ local: messages.length - remote, remote });
  }

  private ofAccount(accountId: AccountId): Message[] {
    return [...this.db.tables.messages.values()].filter(
      (message) => message.accountId === accountId,
    );
  }
}
