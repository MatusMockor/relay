import type { GoogleCalendarRecord, GoogleConnectionRecord } from '@relay/engine';
import {
  AccountIdSchema,
  CalendarConnectionIdSchema,
  CalendarConnectionStatusSchema,
  GoogleCalendarSchema,
  UserIdSchema,
} from '@relay/shared/domain';
import type {
  GoogleCalendarConnectionRow,
  GoogleCalendarRow,
  googleCalendarConnections,
  googleCalendars,
} from '../schema';

const timestampOf = (iso: string | null): number | null => (iso === null ? null : Date.parse(iso));

export const toConnectionRecord = (row: GoogleCalendarConnectionRow): GoogleConnectionRecord => ({
  id: CalendarConnectionIdSchema.parse(row.id),
  userId: UserIdSchema.parse(row.userId),
  email: row.email,
  accountId: AccountIdSchema.nullable().parse(row.accountId),
  status: CalendarConnectionStatusSchema.parse(row.status),
  lastError: row.lastError,
  lastSyncedAt: row.lastSyncedAt,
  lastAttemptAt: row.lastAttemptAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toConnectionRow = (
  record: GoogleConnectionRecord,
): typeof googleCalendarConnections.$inferInsert => ({
  ...record,
  lastAttemptTs: timestampOf(record.lastAttemptAt),
});

export const toGoogleCalendarRecord = (row: GoogleCalendarRow): GoogleCalendarRecord => ({
  ...GoogleCalendarSchema.parse({
    id: row.id,
    connectionId: row.connectionId,
    name: row.name,
    color: row.color,
    enabled: row.enabled,
    primary: row.primary,
    accessRole: row.accessRole,
    timeZone: row.timeZone,
    status: row.status,
    lastError: row.lastError,
    lastSyncedAt: row.lastSyncedAt,
  }),
  userId: UserIdSchema.parse(row.userId),
  remoteId: row.remoteId,
  syncToken: row.syncToken,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const toGoogleCalendarRow = (
  record: GoogleCalendarRecord,
): typeof googleCalendars.$inferInsert => ({
  id: record.id,
  userId: record.userId,
  connectionId: record.connectionId,
  remoteId: record.remoteId,
  name: record.name,
  color: record.color,
  enabled: record.enabled,
  primary: record.primary,
  accessRole: record.accessRole,
  timeZone: record.timeZone,
  status: record.status,
  lastError: record.lastError,
  lastSyncedAt: record.lastSyncedAt,
  syncToken: record.syncToken,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});
