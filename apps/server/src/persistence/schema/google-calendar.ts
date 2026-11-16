import type {
  AccountId,
  CalendarConnectionId,
  CalendarConnectionStatus,
  GoogleCalendarAccessRole,
  GoogleCalendarId,
  GoogleCalendarSyncStatus,
  UserId,
} from '@relay/shared/domain';
import { boolean, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { timestampTz } from './columns';
import { users } from './users';

export const googleCalendarConnections = pgTable(
  'google_calendar_connections',
  {
    id: text('id').$type<CalendarConnectionId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    accountId: text('account_id').$type<AccountId>(),
    credentialsEnvelope: text('credentials_envelope'),
    status: text('status').$type<CalendarConnectionStatus>().notNull(),
    lastError: text('last_error'),
    lastSyncedAt: timestampTz('last_synced_at'),
    lastAttemptAt: timestampTz('last_attempt_at'),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('google_calendar_connections_user_email_unique').on(table.userId, table.email),
    index('google_calendar_connections_attempt_idx').on(table.lastAttemptAt),
  ],
);

export const googleCalendars = pgTable(
  'google_calendars',
  {
    id: text('id').$type<GoogleCalendarId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    connectionId: text('connection_id')
      .$type<CalendarConnectionId>()
      .notNull()
      .references(() => googleCalendarConnections.id, { onDelete: 'cascade' }),
    remoteId: text('remote_id').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    enabled: boolean('enabled').notNull(),
    primary: boolean('is_primary').notNull(),
    accessRole: text('access_role').$type<GoogleCalendarAccessRole>().notNull(),
    timeZone: text('time_zone'),
    status: text('status').$type<GoogleCalendarSyncStatus>().notNull(),
    lastError: text('last_error'),
    lastSyncedAt: timestampTz('last_synced_at'),
    syncToken: text('sync_token'),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('google_calendars_connection_remote_unique').on(table.connectionId, table.remoteId),
    index('google_calendars_user_idx').on(table.userId),
  ],
);

export type GoogleCalendarConnectionRow = typeof googleCalendarConnections.$inferSelect;
export type GoogleCalendarRow = typeof googleCalendars.$inferSelect;
