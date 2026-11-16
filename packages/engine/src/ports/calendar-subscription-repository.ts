import type {
  CalendarSubscriptionId,
  CalendarSubscriptionStatus,
  UserId,
} from '@relay/shared/domain';
import type { CalendarSubscriptionRecord } from '../model/calendar';

export interface CalendarSubscriptionChanges {
  readonly name?: string;
  readonly color?: string;
  readonly updatedAt: string;
}

export interface CalendarFetchRecord {
  readonly status: CalendarSubscriptionStatus;
  readonly lastError: string | null;
  readonly attemptedAt: string;
  readonly syncedAt: string | null;
  readonly etag?: string | null;
  readonly lastModified?: string | null;
  readonly eventCount?: number;
}

export interface CalendarSubscriptionRepository {
  list(userId: UserId): Promise<CalendarSubscriptionRecord[]>;
  findById(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
  ): Promise<CalendarSubscriptionRecord | null>;
  create(record: CalendarSubscriptionRecord): Promise<CalendarSubscriptionRecord>;
  update(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
    changes: CalendarSubscriptionChanges,
  ): Promise<CalendarSubscriptionRecord | null>;
  delete(userId: UserId, subscriptionId: CalendarSubscriptionId): Promise<boolean>;
  lockForRefresh(subscriptionId: CalendarSubscriptionId): Promise<boolean>;
  listDue(attemptedBefore: string, limit: number): Promise<CalendarSubscriptionRecord[]>;
  recordFetch(subscriptionId: CalendarSubscriptionId, record: CalendarFetchRecord): Promise<void>;
}
