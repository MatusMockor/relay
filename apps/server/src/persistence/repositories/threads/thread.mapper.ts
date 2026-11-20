import type { LabelId, SplitId, ThreadSummary, UserId } from '@relay/shared/domain';
import type { threads } from '../../schema';
import { toDate, toDateOrNull, toIso, toIsoOrNull } from '../../support/timestamps';

type ThreadRow = typeof threads.$inferSelect & {
  readonly splitIds: SplitId[];
  readonly labelIds: LabelId[];
  readonly hasDraft: boolean;
};
type ThreadInsert = typeof threads.$inferInsert;

export const toThreadSummary = (row: ThreadRow): ThreadSummary => ({
  id: row.id,
  accountId: row.accountId,
  subject: row.subject,
  participants: row.participants,
  lastMessageAt: toIso(row.lastMessageAt),
  messageCount: row.messageCount,
  unread: row.unread,
  snippet: row.snippet,
  aiOneLiner: row.aiOneLiner,
  jiraKey: row.jiraKey,
  jiraActor: row.jiraActor,
  splitIds: row.splitIds,
  labelIds: row.labelIds,
  state: row.state,
  markedDone: row.markedDone,
  remindAt: toIsoOrNull(row.remindAt),
  hasDraft: row.hasDraft,
});

export const toThreadInsert = (userId: UserId, thread: ThreadSummary): ThreadInsert => ({
  id: thread.id,
  userId,
  accountId: thread.accountId,
  subject: thread.subject,
  participants: thread.participants,
  lastMessageAt: toDate(thread.lastMessageAt),
  messageCount: thread.messageCount,
  unread: thread.unread,
  snippet: thread.snippet,
  aiOneLiner: thread.aiOneLiner,
  jiraKey: thread.jiraKey,
  jiraActor: thread.jiraActor,
  state: thread.state,
  markedDone: thread.markedDone ?? false,
  remindAt: toDateOrNull(thread.remindAt),
});
