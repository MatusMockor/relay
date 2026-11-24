import type {
  AccountId,
  Address,
  JiraKey,
  SplitId,
  ThreadId,
  ThreadState,
  UserId,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { timestampTz } from './columns';
import { splits } from './splits';
import { users } from './users';

export const threads = pgTable(
  'threads',
  {
    id: text('id').$type<ThreadId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    participants: jsonb('participants').$type<Address[]>().notNull(),
    lastMessageAt: timestampTz('last_message_at').notNull(),
    messageCount: integer('message_count').notNull(),
    unread: boolean('unread').notNull(),
    snippet: text('snippet').notNull(),
    aiOneLiner: text('ai_one_liner'),
    jiraKey: text('jira_key').$type<JiraKey>(),
    jiraActor: text('jira_actor'),
    state: text('state').$type<ThreadState>().notNull(),
    markedDone: boolean('marked_done').notNull().default(false),
    remindAt: timestampTz('remind_at'),
  },
  (table) => [
    index('threads_user_folder_idx').on(
      table.userId,
      table.state,
      table.lastMessageAt.desc(),
      table.id.desc(),
    ),
    index('threads_account_folder_idx').on(
      table.accountId,
      table.state,
      table.lastMessageAt.desc(),
      table.id.desc(),
    ),
    index('threads_jira_key_idx')
      .on(table.userId, table.jiraKey)
      .where(sql`${table.jiraKey} is not null`),
  ],
);

export const threadSplits = pgTable(
  'thread_splits',
  {
    threadId: text('thread_id')
      .$type<ThreadId>()
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    splitId: text('split_id')
      .$type<SplitId>()
      .notNull()
      .references(() => splits.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.splitId] }),
    index('thread_splits_split_idx').on(table.splitId),
  ],
);
