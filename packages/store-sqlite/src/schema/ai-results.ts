import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const aiResults = sqliteTable(
  'ai_results',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    threadId: text('thread_id'),
    sourceMessageId: text('source_message_id'),
    kind: text('kind').notNull(),
    runner: text('runner').notNull(),
    output: text('output', { mode: 'json' }).notNull(),
    createdAt: text('created_at').notNull(),
    createdTs: integer('created_ts').notNull(),
  },
  (table) => [
    index('ai_results_latest_idx').on(table.userId, table.threadId, table.kind, table.createdTs),
    index('ai_results_thread_idx').on(table.threadId),
  ],
);

export type AiResultRow = typeof aiResults.$inferSelect;
