import type { CalendarSubscriptionRecord } from '@relay/engine';
import { CalendarSubscriptionSchema } from '@relay/shared/domain';
import type { CalendarSubscriptionRow, calendarSubscriptions } from '../schema';

export const toSubscriptionRecord = (row: CalendarSubscriptionRow): CalendarSubscriptionRecord => ({
  ...CalendarSubscriptionSchema.parse({
    id: row.id,
    userId: row.userId,
    name: row.name,
    color: row.color,
    host: row.host,
    status: row.status,
    lastError: row.lastError,
    lastSyncedAt: row.lastSyncedAt,
    eventCount: row.eventCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }),
  etag: row.etag,
  lastModified: row.lastModified,
  lastAttemptAt: row.lastAttemptAt,
});

export const toSubscriptionRow = (
  record: CalendarSubscriptionRecord,
): typeof calendarSubscriptions.$inferInsert => ({
  id: record.id,
  userId: record.userId,
  name: record.name,
  color: record.color,
  host: record.host,
  status: record.status,
  lastError: record.lastError,
  lastSyncedAt: record.lastSyncedAt,
  eventCount: record.eventCount,
  etag: record.etag,
  lastModified: record.lastModified,
  lastAttemptAt: record.lastAttemptAt,
  lastAttemptTs: record.lastAttemptAt === null ? null : Date.parse(record.lastAttemptAt),
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});
