import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';

export const threads = sqliteTable(
  'threads',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    participants: text('participants', { mode: 'json' }).notNull(),
    lastMessageAt: text('last_message_at').notNull(),
    lastMessageTs: integer('last_message_ts').notNull(),
    messageCount: integer('message_count').notNull(),
    unread: integer('unread', { mode: 'boolean' }).notNull(),
    snippet: text('snippet').notNull(),
    aiOneLiner: text('ai_one_liner'),
    jiraKey: text('jira_key'),
    jiraActor: text('jira_actor'),
    labelIds: text('label_ids', { mode: 'json' }).notNull(),
    state: text('state').notNull(),
    remindAt: text('remind_at'),
    hasDraft: integer('has_draft', { mode: 'boolean' }).notNull(),
  },
  (table) => [
    index('threads_user_state_order_idx').on(
      table.userId,
      table.state,
      table.lastMessageTs,
      table.id,
    ),
    index('threads_account_state_order_idx').on(
      table.accountId,
      table.state,
      table.lastMessageTs,
      table.id,
    ),
  ],
);

export type ThreadRow = typeof threads.$inferSelect;
