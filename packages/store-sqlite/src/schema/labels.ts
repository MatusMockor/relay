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
    kind: text('kind').notNull().default('keyword'),
    remoteName: text('remote_name').notNull(),
    nameKey: text('name_key').notNull().default(''),
  },
  (table) => [
    uniqueIndex('labels_account_name_key_unique').on(table.accountId, table.nameKey),
    uniqueIndex('labels_account_kind_remote_unique').on(
      table.accountId,
      table.kind,
      table.remoteName,
    ),
  ],
);

export type LabelRow = typeof labels.$inferSelect;
