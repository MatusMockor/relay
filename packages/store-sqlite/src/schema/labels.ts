import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';

export const labels = sqliteTable(
  'labels',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
  },
  (table) => [uniqueIndex('labels_account_name_unique').on(table.accountId, table.name)],
);

export type LabelRow = typeof labels.$inferSelect;
