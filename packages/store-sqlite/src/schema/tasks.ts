import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { threads } from './threads';

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    threadId: text('thread_id').references(() => threads.id, { onDelete: 'set null' }),
    jiraKey: text('jira_key'),
    title: text('title').notNull(),
    aiWhat: text('ai_what'),
    state: text('state').notNull(),
    source: text('source').notNull(),
    priority: text('priority').notNull().default('none'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    updatedTs: integer('updated_ts').notNull(),
  },
  (table) => [
    index('tasks_user_order_idx').on(table.userId, table.updatedTs, table.id),
    index('tasks_thread_idx').on(table.threadId),
    uniqueIndex('tasks_user_jira_unique')
      .on(table.userId, table.jiraKey)
      .where(sql`${table.jiraKey} is not null`),
  ],
);

export type TaskRow = typeof tasks.$inferSelect;
