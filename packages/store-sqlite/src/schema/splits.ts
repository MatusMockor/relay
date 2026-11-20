import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';

export const splits = sqliteTable(
  'splits',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    match: text('match').notNull().default('any'),
    rules: text('rules', { mode: 'json' }).notNull(),
    exceptions: text('exceptions', { mode: 'json' }).notNull().default([]),
    exclusive: integer('exclusive', { mode: 'boolean' }).notNull(),
    hideTasks: integer('hide_tasks', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [index('splits_user_position_idx').on(table.userId, table.position)],
);

export type SplitRow = typeof splits.$inferSelect;
