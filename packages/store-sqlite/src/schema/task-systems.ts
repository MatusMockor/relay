import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const taskSystemConnections = sqliteTable(
  'task_system_connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(),
    label: text('label').notNull(),
    siteUrl: text('site_url').notNull(),
    accountName: text('account_name').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    status: text('status').notNull(),
    lastError: text('last_error'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('task_system_connections_account_unique').on(
      table.userId,
      table.provider,
      table.siteUrl,
      table.externalAccountId,
    ),
  ],
);

export type TaskSystemConnectionRow = typeof taskSystemConnections.$inferSelect;
