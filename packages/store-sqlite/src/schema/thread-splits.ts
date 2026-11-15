import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { threads } from './threads';

export const threadSplits = sqliteTable(
  'thread_splits',
  {
    threadId: text('thread_id')
      .notNull()
      .references(() => threads.id, { onDelete: 'cascade' }),
    splitId: text('split_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.threadId, table.splitId] }),
    index('thread_splits_split_idx').on(table.splitId, table.threadId),
  ],
);
