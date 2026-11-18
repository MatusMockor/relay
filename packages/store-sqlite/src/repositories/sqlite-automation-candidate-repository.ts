import type {
  AutomationCandidateRepository,
  InboxCandidate,
  StoredMatchSubject,
} from '@relay/engine';
import { type AccountId, JiraKeySchema, ThreadIdSchema } from '@relay/shared/domain';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { messages, threads } from '../schema';
import { chunked } from './chunked';
import { matchSubjectColumns, toStoredMatchSubject } from './match-subject-row';

export class SqliteAutomationCandidateRepository implements AutomationCandidateRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listInbox(accountId: AccountId, limit: number): Promise<InboxCandidate[]> {
    return this.executor.execute((db) => {
      const inbox = db
        .select({ id: threads.id, jiraKey: threads.jiraKey, lastMessageAt: threads.lastMessageAt })
        .from(threads)
        .where(and(eq(threads.accountId, accountId), eq(threads.state, 'inbox')))
        .orderBy(desc(threads.lastMessageTs), desc(threads.id))
        .limit(limit)
        .all();
      const byThread = new Map<string, StoredMatchSubject[]>();
      chunked(inbox.map((thread) => thread.id)).forEach((threadIds) => {
        db.select(matchSubjectColumns)
          .from(messages)
          .where(inArray(messages.threadId, threadIds))
          .orderBy(asc(messages.threadId), asc(messages.dateTs))
          .all()
          .map(toStoredMatchSubject)
          .forEach((subject) => {
            byThread.set(subject.threadId, [...(byThread.get(subject.threadId) ?? []), subject]);
          });
      });
      return inbox.map((thread) => ({
        threadId: ThreadIdSchema.parse(thread.id),
        jiraKey: thread.jiraKey === null ? null : JiraKeySchema.parse(thread.jiraKey),
        lastMessageAt: thread.lastMessageAt,
        messages: byThread.get(thread.id) ?? [],
      }));
    });
  }
}
