import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';

export const mailboxes = sqliteTable(
  'mailboxes',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    path: text('path').notNull(),
    delimiter: text('delimiter'),
    role: text('role').notNull(),
    unreadCount: integer('unread_count').notNull(),
    totalCount: integer('total_count').notNull(),
  },
  (table) => [
    uniqueIndex('mailboxes_account_path_unique').on(table.accountId, table.path),
    index('mailboxes_account_role_idx').on(table.accountId, table.role),
  ],
);

export type MailboxRow = typeof mailboxes.$inferSelect;
