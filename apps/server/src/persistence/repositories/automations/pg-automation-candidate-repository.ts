import {
  type AutomationCandidateRepository,
  hasFileAttachments,
  type InboxCandidate,
  type StoredMatchSubject,
} from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages, threads } from '../../schema';
import { toIso } from '../../support/timestamps';
import { toMessageHeaders } from '../messages/message-headers';

export class PgAutomationCandidateRepository implements AutomationCandidateRepository {
  constructor(private readonly db: DbExecutor) {}

  async listInbox(accountId: AccountId, limit: number): Promise<InboxCandidate[]> {
    const inbox = await this.db
      .select({ id: threads.id, jiraKey: threads.jiraKey, lastMessageAt: threads.lastMessageAt })
      .from(threads)
      .where(and(eq(threads.accountId, accountId), eq(threads.state, 'inbox')))
      .orderBy(desc(threads.lastMessageAt), desc(threads.id))
      .limit(limit);
    const byThread = await this.subjectsOf(inbox.map((thread) => thread.id));
    return inbox.map((thread) => ({
      threadId: thread.id,
      jiraKey: thread.jiraKey,
      lastMessageAt: toIso(thread.lastMessageAt),
      messages: byThread.get(thread.id) ?? [],
    }));
  }

  private async subjectsOf(
    threadIds: readonly InboxCandidate['threadId'][],
  ): Promise<Map<string, StoredMatchSubject[]>> {
    const byThread = new Map<string, StoredMatchSubject[]>();
    if (threadIds.length === 0) {
      return byThread;
    }
    const rows = await this.db
      .select({
        id: messages.id,
        threadId: messages.threadId,
        from: messages.from,
        subject: messages.subject,
        headers: messages.headers,
        to: messages.to,
        cc: messages.cc,
        attachments: messages.attachments,
      })
      .from(messages)
      .where(inArray(messages.threadId, [...threadIds]))
      .orderBy(asc(messages.threadId), asc(messages.date));
    rows.forEach((row) => {
      const subject: StoredMatchSubject = {
        messageId: row.id,
        threadId: row.threadId,
        subject: {
          from: row.from,
          subject: row.subject,
          headers: toMessageHeaders(row.headers),
          to: row.to,
          cc: row.cc,
          hasAttachments: hasFileAttachments(row.attachments),
        },
      };
      byThread.set(row.threadId, [...(byThread.get(row.threadId) ?? []), subject]);
    });
    return byThread;
  }
}
