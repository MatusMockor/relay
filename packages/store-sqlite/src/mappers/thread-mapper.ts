import { type ThreadSummary, ThreadSummarySchema, type UserId } from '@relay/shared/domain';
import type { ThreadRow, threads } from '../schema';
import { toTimestamp } from './timestamp';

export const toThreadSummary = (row: ThreadRow, splitIds: readonly string[]): ThreadSummary =>
  ThreadSummarySchema.parse({
    id: row.id,
    accountId: row.accountId,
    subject: row.subject,
    participants: row.participants,
    lastMessageAt: row.lastMessageAt,
    messageCount: row.messageCount,
    unread: row.unread,
    snippet: row.snippet,
    aiOneLiner: row.aiOneLiner,
    jiraKey: row.jiraKey,
    jiraActor: row.jiraActor,
    splitIds,
    labelIds: row.labelIds,
    state: row.state,
    markedDone: row.markedDone,
    remindAt: row.remindAt,
    hasDraft: row.hasDraft,
  });

export const toThreadRow = (
  userId: UserId,
  thread: ThreadSummary,
): typeof threads.$inferInsert => ({
  id: thread.id,
  userId,
  accountId: thread.accountId,
  subject: thread.subject,
  participants: thread.participants,
  lastMessageAt: thread.lastMessageAt,
  lastMessageTs: toTimestamp(thread.lastMessageAt),
  messageCount: thread.messageCount,
  unread: thread.unread,
  snippet: thread.snippet,
  aiOneLiner: thread.aiOneLiner,
  jiraKey: thread.jiraKey,
  jiraActor: thread.jiraActor,
  labelIds: thread.labelIds,
  state: thread.state,
  markedDone: thread.markedDone ?? false,
  remindAt: thread.remindAt,
  hasDraft: thread.hasDraft,
});
