import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  userId: text('user_id').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});
