import {
  type AutomationCandidateRepository,
  type InboxCandidate,
  RECENT_EXCLUDED_ROLES,
  RECENT_EXCLUDED_STATES,
  type RecentCandidatesQuery,
} from '@relay/engine';
import {
  type AccountId,
  JiraKeySchema,
  type Message,
  type MessageId,
  ThreadIdSchema,
  type UserId,
} from '@relay/shared/domain';
import { and, desc, eq, exists, gte, inArray, notInArray, type SQL, sql } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toTimestamp } from '../mappers/timestamp';
import { toMessage } from '../mappers/message-mapper';
import { mailboxes, messages, threads } from '../schema';
import { candidateSubjects } from './candidate-subjects-query';
import { chunked } from './chunked';
import { readMessageLabels } from './message-label-reader';

interface ThreadRow {
  readonly id: string;
  readonly jiraKey: string | null;
  readonly lastMessageAt: string;
}

const threadColumns = {
  id: threads.id,
  jiraKey: threads.jiraKey,
  lastMessageAt: threads.lastMessageAt,
};

const receivedSince = (since: number): SQL | undefined =>
  and(gte(messages.dateTs, since), notInArray(mailboxes.role, [...RECENT_EXCLUDED_ROLES]));

export class SqliteAutomationCandidateRepository implements AutomationCandidateRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listInbox(accountId: AccountId, limit: number): Promise<InboxCandidate[]> {
    return this.executor.execute((db) => {
      const inbox = db
        .select(threadColumns)
        .from(threads)
        .where(and(eq(threads.accountId, accountId), eq(threads.state, 'inbox')))
        .orderBy(desc(threads.lastMessageTs), desc(threads.id))
        .limit(limit)
        .all();
      return candidatesOf(db, inbox, undefined);
    });
  }

  listRecent(accountId: AccountId, query: RecentCandidatesQuery): Promise<InboxCandidate[]> {
    const since = toTimestamp(query.since);
    return this.executor.execute((db) => {
      const received = db
        .select({ one: sql`1` })
        .from(messages)
        .innerJoin(mailboxes, eq(mailboxes.id, messages.mailboxId))
        .where(and(eq(messages.threadId, threads.id), receivedSince(since)));
      const recent = db
        .select(threadColumns)
        .from(threads)
        .where(
          and(
            eq(threads.accountId, accountId),
            notInArray(threads.state, [...RECENT_EXCLUDED_STATES]),
            gte(threads.lastMessageTs, since),
            exists(received),
          ),
        )
        .orderBy(desc(threads.lastMessageTs), desc(threads.id))
        .limit(query.limit)
        .all();
      return candidatesOf(db, recent, receivedSince(since));
    });
  }

  findMessages(userId: UserId, messageIds: readonly MessageId[]): Promise<Message[]> {
    return this.executor.execute((db) =>
      chunked(messageIds).flatMap((chunk) => {
        const rows = db
          .select()
          .from(messages)
          .where(and(eq(messages.userId, userId), inArray(messages.id, chunk)))
          .all();
        const labels = readMessageLabels(
          db,
          rows.map((row) => row.id),
        );
        return rows.map((row) => toMessage(row, labels.get(row.id) ?? []));
      }),
    );
  }
}

const candidatesOf = (
  db: RelayDb,
  rows: readonly ThreadRow[],
  filter: SQL | undefined,
): InboxCandidate[] => {
  const byThread = candidateSubjects(
    db,
    rows.map((thread) => thread.id),
    filter,
  );
  return rows.map((thread) => ({
    threadId: ThreadIdSchema.parse(thread.id),
    jiraKey: thread.jiraKey === null ? null : JiraKeySchema.parse(thread.jiraKey),
    lastMessageAt: thread.lastMessageAt,
    messages: byThread.get(thread.id) ?? [],
  }));
};
