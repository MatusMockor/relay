import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';

export const drafts = sqliteTable(
  'drafts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    to: text('to', { mode: 'json' }).notNull(),
    cc: text('cc', { mode: 'json' }).notNull(),
    bcc: text('bcc', { mode: 'json' }).notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    inReplyToThreadId: text('in_reply_to_thread_id'),
    inReplyToMessageId: text('in_reply_to_message_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedTs: integer('updated_ts').notNull(),
  },
  (table) => [
    index('drafts_user_order_idx').on(table.userId, table.updatedTs),
    index('drafts_thread_idx').on(table.inReplyToThreadId),
  ],
);

export type DraftRow = typeof drafts.$inferSelect;
