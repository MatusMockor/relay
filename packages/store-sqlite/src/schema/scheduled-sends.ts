import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';

export const scheduledSends = sqliteTable(
  'scheduled_sends',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    draftId: text('draft_id').notNull(),
    scheduledAt: text('scheduled_at').notNull(),
    scheduledTs: integer('scheduled_ts').notNull(),
    status: text('status').notNull(),
    error: text('error'),
    sentAt: text('sent_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('scheduled_sends_status_due_idx').on(table.status, table.scheduledTs),
    index('scheduled_sends_user_idx').on(table.userId, table.status, table.scheduledTs),
    index('scheduled_sends_draft_idx').on(table.draftId),
  ],
);

export type ScheduledSendRow = typeof scheduledSends.$inferSelect;
