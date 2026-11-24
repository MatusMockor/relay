import type { AccountId, Message, MessageId, ThreadSummary, UserId } from '@relay/shared/domain';
import type {
  AutomationCandidateRepository,
  InboxCandidate,
  RecentCandidatesQuery,
} from '../../../src';
import {
  CANDIDATE_MESSAGES_PER_THREAD,
  matchSubjectOf,
  RECENT_EXCLUDED_ROLES,
  RECENT_EXCLUDED_STATES,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

const newestFirst = (left: ThreadSummary, right: ThreadSummary): number =>
  right.lastMessageAt.localeCompare(left.lastMessageAt) || right.id.localeCompare(left.id);

export class MemoryAutomationCandidateRepository implements AutomationCandidateRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listInbox(accountId: AccountId, limit: number): Promise<InboxCandidate[]> {
    const inbox = [...this.db.tables.threads.values()]
      .filter((thread) => thread.accountId === accountId && thread.state === 'inbox')
      .sort(newestFirst)
      .slice(0, limit);
    return Promise.resolve(inbox.map((thread) => this.candidateOf(thread, () => true)));
  }

  listRecent(accountId: AccountId, query: RecentCandidatesQuery): Promise<InboxCandidate[]> {
    const since = Date.parse(query.since);
    const arrived = (message: Message): boolean => {
      const role = this.db.tables.mailboxes.get(message.mailboxId)?.role;
      return (
        Date.parse(message.date) >= since &&
        role !== undefined &&
        !RECENT_EXCLUDED_ROLES.includes(role)
      );
    };
    const recent = [...this.db.tables.threads.values()]
      .filter(
        (thread) =>
          thread.accountId === accountId &&
          !RECENT_EXCLUDED_STATES.includes(thread.state) &&
          Date.parse(thread.lastMessageAt) >= since,
      )
      .sort(newestFirst)
      .map((thread) => this.candidateOf(thread, arrived))
      .filter((candidate) => candidate.messages.length > 0)
      .slice(0, query.limit);
    return Promise.resolve(recent);
  }

  findMessages(userId: UserId, messageIds: readonly MessageId[]): Promise<Message[]> {
    return Promise.resolve(
      messageIds.flatMap((id) => {
        const message = this.db.tables.messages.get(id);
        return message !== undefined && this.db.ownsAccount(userId, message.accountId)
          ? [message]
          : [];
      }),
    );
  }

  private candidateOf(thread: ThreadSummary, keep: (message: Message) => boolean): InboxCandidate {
    const { messages, messageHeaders } = this.db.tables;
    return {
      threadId: thread.id,
      jiraKey: thread.jiraKey,
      lastMessageAt: thread.lastMessageAt,
      messages: [...messages.values()]
        .filter((message) => message.threadId === thread.id && keep(message))
        .sort((left, right) => left.date.localeCompare(right.date))
        .slice(-CANDIDATE_MESSAGES_PER_THREAD)
        .map((message) => ({
          messageId: message.id,
          threadId: message.threadId,
          subject: matchSubjectOf(
            message,
            messageHeaders.get(message.id) ?? new Map<string, string[]>(),
          ),
        })),
    };
  }
}
