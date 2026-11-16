import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const calendarSubscriptions = sqliteTable(
  'calendar_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    host: text('host').notNull(),
    status: text('status').notNull(),
    lastError: text('last_error'),
    lastSyncedAt: text('last_synced_at'),
    eventCount: integer('event_count').notNull(),
    etag: text('etag'),
    lastModified: text('last_modified'),
    lastAttemptAt: text('last_attempt_at'),
    lastAttemptTs: integer('last_attempt_ts'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('calendar_subscriptions_user_idx').on(table.userId, table.createdAt),
    index('calendar_subscriptions_attempt_idx').on(table.lastAttemptTs),
  ],
);

export type CalendarSubscriptionRow = typeof calendarSubscriptions.$inferSelect;
