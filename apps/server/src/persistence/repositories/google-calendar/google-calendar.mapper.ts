import type { GoogleCalendarRecord, GoogleConnectionRecord } from '@relay/engine';
import type {
  GoogleCalendarConnectionRow,
  GoogleCalendarRow,
  googleCalendarConnections,
  googleCalendars,
} from '../../schema';
import { toDate, toDateOrNull, toIso, toIsoOrNull } from '../../support/timestamps';

export const toConnectionRecord = (
  row: Omit<GoogleCalendarConnectionRow, 'credentialsEnvelope'>,
): GoogleConnectionRecord => ({
  id: row.id,
  userId: row.userId,
  email: row.email,
  accountId: row.accountId,
  status: row.status,
  lastError: row.lastError,
  lastSyncedAt: toIsoOrNull(row.lastSyncedAt),
  lastAttemptAt: toIsoOrNull(row.lastAttemptAt),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const toConnectionInsert = (
  record: GoogleConnectionRecord,
): typeof googleCalendarConnections.$inferInsert => ({
  id: record.id,
  userId: record.userId,
  email: record.email,
  accountId: record.accountId,
  status: record.status,
  lastError: record.lastError,
  lastSyncedAt: toDateOrNull(record.lastSyncedAt),
  lastAttemptAt: toDateOrNull(record.lastAttemptAt),
  createdAt: toDate(record.createdAt),
  updatedAt: toDate(record.updatedAt),
});

export const toGoogleCalendarRecord = (row: GoogleCalendarRow): GoogleCalendarRecord => ({
  id: row.id,
  userId: row.userId,
  connectionId: row.connectionId,
  remoteId: row.remoteId,
  name: row.name,
  color: row.color,
  enabled: row.enabled,
  primary: row.primary,
  accessRole: row.accessRole,
  timeZone: row.timeZone,
  status: row.status,
  lastError: row.lastError,
  lastSyncedAt: toIsoOrNull(row.lastSyncedAt),
  syncToken: row.syncToken,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const toGoogleCalendarInsert = (
  record: GoogleCalendarRecord,
): typeof googleCalendars.$inferInsert => ({
  ...record,
  lastSyncedAt: toDateOrNull(record.lastSyncedAt),
  createdAt: toDate(record.createdAt),
  updatedAt: toDate(record.updatedAt),
});
