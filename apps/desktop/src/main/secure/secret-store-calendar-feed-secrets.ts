import type { CalendarFeedSecrets } from '@relay/engine';
import type { CalendarSubscriptionId } from '@relay/shared/domain';
import type { SecretStore } from './secret-store';

export class SecretStoreCalendarFeedSecrets implements CalendarFeedSecrets {
  constructor(private readonly store: SecretStore) {}

  get(subscriptionId: CalendarSubscriptionId): Promise<string | null> {
    return this.store.get(subscriptionId);
  }

  set(subscriptionId: CalendarSubscriptionId, url: string): Promise<void> {
    return this.store.set(subscriptionId, url);
  }

  delete(subscriptionId: CalendarSubscriptionId): Promise<void> {
    return this.store.delete(subscriptionId);
  }
}
