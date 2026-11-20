import type { Message, ThreadSearchField, ThreadSummary } from '@relay/shared/domain';
import { hasFileAttachments, type ThreadFolderQuery } from '../../../src';
import type { MemoryDatabase } from './memory-database';

const activeSearch = (search: string | null): string | null => {
  const trimmed = search?.trim() ?? '';
  return trimmed === '' ? null : trimmed.toLowerCase();
};

const messageFields = (message: Message, field: ThreadSearchField | null): (string | null)[] => {
  const sender = [message.from?.name ?? null, message.from?.email ?? null];
  if (field === 'from') {
    return sender;
  }
  if (field === 'subject') {
    return [message.subject];
  }
  return [message.subject, ...sender, message.snippet, message.textBody];
};

const summaryFields = (thread: ThreadSummary): string[] => [
  thread.subject,
  thread.snippet,
  ...thread.participants.flatMap((address) => [address.email, address.name ?? '']),
];

const contains =
  (needle: string) =>
  (value: string | null): boolean =>
    (value ?? '').toLowerCase().includes(needle);

const withFileAttachment = (message: Message): boolean => hasFileAttachments(message.attachments);

export class ThreadSearchMatch {
  constructor(private readonly db: MemoryDatabase) {}

  matches(thread: ThreadSummary, query: ThreadFolderQuery): boolean {
    const needle = activeSearch(query.search);
    const attachmentRequired = query.hasAttachment === true;
    if (needle === null) {
      return !attachmentRequired || this.messagesOf(thread).some(withFileAttachment);
    }
    const field = query.searchField ?? null;
    const matched = this.messagesOf(thread).filter((message) =>
      messageFields(message, field).some(contains(needle)),
    );
    if (attachmentRequired) {
      return matched.some(withFileAttachment);
    }
    return matched.length > 0 || (field === null && summaryFields(thread).some(contains(needle)));
  }

  private messagesOf(thread: ThreadSummary): Message[] {
    return [...this.db.tables.messages.values()].filter(
      (message) => message.threadId === thread.id,
    );
  }
}
