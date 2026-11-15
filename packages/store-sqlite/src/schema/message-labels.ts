import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { labels } from './labels';
import { messages } from './messages';

export const messageLabels = sqliteTable(
  'message_labels',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.labelId] }),
    index('message_labels_label_idx').on(table.labelId),
  ],
);
