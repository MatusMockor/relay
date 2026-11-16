import type { CalendarSubscription } from '@relay/shared/domain';
import type { CalendarSubscriptionRecord } from '../../model/calendar';

export const toSubscription = (record: CalendarSubscriptionRecord): CalendarSubscription => ({
  id: record.id,
  userId: record.userId,
  name: record.name,
  color: record.color,
  host: record.host,
  status: record.status,
  lastError: record.lastError,
  lastSyncedAt: record.lastSyncedAt,
  eventCount: record.eventCount,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});
