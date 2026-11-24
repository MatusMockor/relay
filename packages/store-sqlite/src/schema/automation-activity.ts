import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { automations } from './automations';

export const automationActivity = sqliteTable(
  'automation_activity',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    automationId: text('automation_id')
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').notNull(),
    messageId: text('message_id').notNull(),
    source: text('source').notNull(),
    sender: text('sender', { mode: 'json' }),
    subject: text('subject').notNull(),
    actions: text('actions', { mode: 'json' }).notNull(),
    failedCount: integer('failed_count').notNull(),
    createdAt: text('created_at').notNull(),
    createdTs: integer('created_ts').notNull(),
    undoneAt: text('undone_at'),
  },
  (table) => [
    index('automation_activity_user_automation_created_idx').on(
      table.userId,
      table.automationId,
      table.createdTs,
    ),
  ],
);

export type AutomationActivityRow = typeof automationActivity.$inferSelect;
