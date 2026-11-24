import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { messages } from './messages';

export const messageAliases = sqliteTable('message_aliases', {
  aliasId: text('alias_id').primaryKey(),
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
});
