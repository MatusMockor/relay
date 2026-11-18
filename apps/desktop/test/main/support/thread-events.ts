import {
  AccountIdSchema,
  SplitIdSchema,
  type ThreadSummary,
  ThreadIdSchema,
} from '@relay/shared/domain';
import type { RealtimeEvent } from '@relay/shared/realtime';

export const thread = (id: string, lastMessageAt: string, unread = true): ThreadSummary => ({
  id: ThreadIdSchema.parse(id),
  accountId: AccountIdSchema.parse('acc_1'),
  subject: `Predmet ${id}`,
  participants: [{ name: 'Jana Nováková', email: 'jana@example.com' }],
  lastMessageAt,
  messageCount: 1,
  unread,
  snippet: '',
  aiOneLiner: null,
  jiraKey: null,
  jiraActor: null,
  splitIds: [],
  labelIds: [],
  state: 'inbox',
  remindAt: null,
  hasDraft: false,
});

export const inSplit = (summary: ThreadSummary): ThreadSummary => ({
  ...summary,
  splitIds: [SplitIdSchema.parse('split_newsletters')],
});

export const upserted = (summary: ThreadSummary): RealtimeEvent => ({
  type: 'thread.upserted',
  at: summary.lastMessageAt,
  data: { thread: summary },
});
