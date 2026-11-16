import type { CalendarSubscriptionRecord } from '@relay/engine';
import type { CalendarSubscriptionRow, calendarSubscriptions } from '../../schema';
import { toDate, toDateOrNull, toIso, toIsoOrNull } from '../../support/timestamps';

export const toSubscriptionRecord = (row: CalendarSubscriptionRow): CalendarSubscriptionRecord => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  color: row.color,
  host: row.host,
  status: row.status,
  lastError: row.lastError,
  lastSyncedAt: toIsoOrNull(row.lastSyncedAt),
  eventCount: row.eventCount,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
  etag: row.etag,
  lastModified: row.lastModified,
  lastAttemptAt: toIsoOrNull(row.lastAttemptAt),
});

export const toSubscriptionInsert = (
  record: CalendarSubscriptionRecord,
): typeof calendarSubscriptions.$inferInsert => ({
  id: record.id,
  userId: record.userId,
  name: record.name,
  color: record.color,
  host: record.host,
  status: record.status,
  lastError: record.lastError,
  lastSyncedAt: toDateOrNull(record.lastSyncedAt),
  eventCount: record.eventCount,
  etag: record.etag,
  lastModified: record.lastModified,
  lastAttemptAt: toDateOrNull(record.lastAttemptAt),
  createdAt: toDate(record.createdAt),
  updatedAt: toDate(record.updatedAt),
});
