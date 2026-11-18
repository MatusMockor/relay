import type { AccountId } from '@relay/shared/domain';
import type { AutomationCandidateRepository, InboxCandidate } from '../../../src';
import { matchSubjectOf } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryAutomationCandidateRepository implements AutomationCandidateRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listInbox(accountId: AccountId, limit: number): Promise<InboxCandidate[]> {
    const { threads, messages, messageHeaders } = this.db.tables;
    const inbox = [...threads.values()]
      .filter((thread) => thread.accountId === accountId && thread.state === 'inbox')
      .sort(
        (left, right) =>
          right.lastMessageAt.localeCompare(left.lastMessageAt) || right.id.localeCompare(left.id),
      )
      .slice(0, limit);
    return Promise.resolve(
      inbox.map((thread) => ({
        threadId: thread.id,
        jiraKey: thread.jiraKey,
        lastMessageAt: thread.lastMessageAt,
        messages: [...messages.values()]
          .filter((message) => message.threadId === thread.id)
          .sort((left, right) => left.date.localeCompare(right.date))
          .map((message) => ({
            messageId: message.id,
            threadId: message.threadId,
            subject: matchSubjectOf(
              message,
              messageHeaders.get(message.id) ?? new Map<string, string[]>(),
            ),
          })),
      })),
    );
  }
}
