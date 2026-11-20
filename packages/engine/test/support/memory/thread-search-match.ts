import type { Message, ThreadSearchField, ThreadSummary } from '@relay/shared/domain';
import { hasFileAttachments, type ThreadFolderQuery } from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { matchesEveryPhrase, toSearchPhrases } from './search-text-match';

const senderOf = (message: Message): string =>
  `${message.from?.name ?? ''} ${message.from?.email ?? ''}`;

const messageFields = (message: Message, field: ThreadSearchField | null): (string | null)[] => {
  if (field === 'from') {
    return [senderOf(message)];
  }
  if (field === 'subject') {
    return [message.subject];
  }
  return [message.subject, senderOf(message), message.snippet, message.textBody];
};

const summaryFields = (thread: ThreadSummary): string[] => [
  thread.subject,
  thread.snippet,
  ...thread.participants.flatMap((address) => [address.email, address.name ?? '']),
];

const withFileAttachment = (message: Message): boolean => hasFileAttachments(message.attachments);

export const hasSearchTerms = (query: ThreadFolderQuery): boolean =>
  toSearchPhrases(query.search).length > 0;

export class ThreadSearchMatch {
  constructor(private readonly db: MemoryDatabase) {}

  matches(thread: ThreadSummary, query: ThreadFolderQuery): boolean {
    const phrases = toSearchPhrases(query.search);
    const attachmentRequired = query.hasAttachment === true;
    if (phrases.length === 0) {
      return !attachmentRequired || this.messagesOf(thread).some(withFileAttachment);
    }
    const field = query.searchField ?? null;
    const matched = this.messagesOf(thread).filter((message) =>
      matchesEveryPhrase(messageFields(message, field), phrases),
    );
    if (attachmentRequired) {
      return matched.some(withFileAttachment);
    }
    return (
      matched.length > 0 || (field === null && matchesEveryPhrase(summaryFields(thread), phrases))
    );
  }

  private messagesOf(thread: ThreadSummary): Message[] {
    return [...this.db.tables.messages.values()].filter(
      (message) => message.threadId === thread.id,
    );
  }
}
