import {
  type AutomationCandidateRepository,
  type InboxCandidate,
  RECENT_EXCLUDED_ROLES,
  RECENT_EXCLUDED_STATES,
  type RecentCandidatesQuery,
} from '@relay/engine';
import type {
  AccountId,
  JiraKey,
  Message,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { and, desc, eq, exists, gte, inArray, notInArray, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messages, threads } from '../../schema';
import { placedOutsideRoles } from '../messages/placement-conditions';
import { toIso } from '../../support/timestamps';
import { toMessage } from '../messages/message.mapper';
import { messageSelection } from '../messages/message-selection';
import { loadCandidateSubjects } from './pg-candidate-subjects';

interface ThreadRow {
  readonly id: ThreadId;
  readonly jiraKey: JiraKey | null;
  readonly lastMessageAt: Date;
}

const threadColumns = {
  id: threads.id,
  jiraKey: threads.jiraKey,
  lastMessageAt: threads.lastMessageAt,
};

const receivedSince = (since: Date): SQL | undefined =>
  and(gte(messages.date, since), placedOutsideRoles(RECENT_EXCLUDED_ROLES));

export class PgAutomationCandidateRepository implements AutomationCandidateRepository {
  constructor(private readonly db: DbExecutor) {}

  async listInbox(accountId: AccountId, limit: number): Promise<InboxCandidate[]> {
    const inbox = await this.db
      .select(threadColumns)
      .from(threads)
      .where(and(eq(threads.accountId, accountId), eq(threads.state, 'inbox')))
      .orderBy(desc(threads.lastMessageAt), desc(threads.id))
      .limit(limit);
    return this.candidatesOf(inbox, undefined);
  }

  async listRecent(accountId: AccountId, query: RecentCandidatesQuery): Promise<InboxCandidate[]> {
    const since = new Date(query.since);
    const received = this.db
      .select({ one: sql`1` })
      .from(messages)
      .where(and(eq(messages.threadId, threads.id), receivedSince(since)));
    const recent = await this.db
      .select(threadColumns)
      .from(threads)
      .where(
        and(
          eq(threads.accountId, accountId),
          notInArray(threads.state, [...RECENT_EXCLUDED_STATES]),
          gte(threads.lastMessageAt, since),
          exists(received),
        ),
      )
      .orderBy(desc(threads.lastMessageAt), desc(threads.id))
      .limit(query.limit);
    return this.candidatesOf(recent, receivedSince(since));
  }

  async findMessages(userId: UserId, messageIds: readonly MessageId[]): Promise<Message[]> {
    if (messageIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select(messageSelection)
      .from(messages)
      .where(and(eq(messages.userId, userId), inArray(messages.id, [...messageIds])));
    return rows.map(toMessage);
  }

  private async candidatesOf(
    rows: readonly ThreadRow[],
    filter: SQL | undefined,
  ): Promise<InboxCandidate[]> {
    const byThread = await loadCandidateSubjects(
      this.db,
      rows.map((thread) => thread.id),
      filter,
    );
    return rows.map((thread) => ({
      threadId: thread.id,
      jiraKey: thread.jiraKey,
      lastMessageAt: toIso(thread.lastMessageAt),
      messages: byThread.get(thread.id) ?? [],
    }));
  }
}
