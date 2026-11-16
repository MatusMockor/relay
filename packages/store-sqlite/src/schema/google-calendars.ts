import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const googleCalendarConnections = sqliteTable(
  'google_calendar_connections',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    email: text('email').notNull(),
    accountId: text('account_id'),
    status: text('status').notNull(),
    lastError: text('last_error'),
    lastSyncedAt: text('last_synced_at'),
    lastAttemptAt: text('last_attempt_at'),
    lastAttemptTs: integer('last_attempt_ts'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('google_calendar_connections_user_email_unique').on(table.userId, table.email),
    index('google_calendar_connections_attempt_idx').on(table.lastAttemptTs),
  ],
);

export const googleCalendars = sqliteTable(
  'google_calendars',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    connectionId: text('connection_id')
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: 'cascade' }),
    remoteId: text('remote_id').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    primary: integer('is_primary', { mode: 'boolean' }).notNull(),
    accessRole: text('access_role').notNull(),
    timeZone: text('time_zone'),
    status: text('status').notNull(),
    lastError: text('last_error'),
    lastSyncedAt: text('last_synced_at'),
    syncToken: text('sync_token'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('google_calendars_connection_remote_unique').on(table.connectionId, table.remoteId),
    index('google_calendars_user_idx').on(table.userId),
  ],
);

export type GoogleCalendarConnectionRow = typeof googleCalendarConnections.$inferSelect;
export type GoogleCalendarRow = typeof googleCalendars.$inferSelect;
