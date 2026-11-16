import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const accounts = sqliteTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(),
    displayName: text('display_name').notNull(),
    senderName: text('sender_name'),
    email: text('email').notNull(),
    color: text('color').notNull(),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull(),
    syncIntervalSeconds: integer('sync_interval_seconds').notNull(),
    settings: text('settings', { mode: 'json' }).notNull(),
    status: text('status').notNull(),
    lastError: text('last_error'),
    lastSyncedAt: text('last_synced_at'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('accounts_user_idx').on(table.userId, table.createdAt),
    uniqueIndex('accounts_user_email_unique').on(table.userId, sql`lower(${table.email})`),
  ],
);

export type AccountRow = typeof accounts.$inferSelect;
