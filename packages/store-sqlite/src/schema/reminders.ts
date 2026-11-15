import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { threads } from './threads';

export const reminders = sqliteTable(
  'reminders',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    remindAt: text('remind_at').notNull(),
    remindTs: integer('remind_ts').notNull(),
    firedAt: text('fired_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('reminders_due_idx').on(table.firedAt, table.remindTs),
    index('reminders_thread_idx').on(table.threadId),
  ],
);

export type ReminderRow = typeof reminders.$inferSelect;
