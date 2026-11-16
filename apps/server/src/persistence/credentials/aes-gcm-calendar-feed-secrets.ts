import type { CalendarFeedSecrets } from '@relay/engine';
import type { CalendarSubscriptionId } from '@relay/shared/domain';
import type { AesGcmCipher } from './aes-gcm-cipher';
import type { PgCalendarFeedSecretStore } from './pg-calendar-feed-secret-store';

const associatedDataFor = (subscriptionId: CalendarSubscriptionId): string =>
  `relay:calendar-feed:${subscriptionId}`;

export class AesGcmCalendarFeedSecrets implements CalendarFeedSecrets {
  constructor(
    private readonly store: PgCalendarFeedSecretStore,
    private readonly cipher: AesGcmCipher,
  ) {}

  async get(subscriptionId: CalendarSubscriptionId): Promise<string | null> {
    const envelope = await this.store.find(subscriptionId);
    if (envelope === null) {
      return null;
    }
    return this.cipher.decrypt(envelope, associatedDataFor(subscriptionId));
  }

  async set(subscriptionId: CalendarSubscriptionId, url: string): Promise<void> {
    const stored = await this.store.save(
      subscriptionId,
      this.cipher.encrypt(url, associatedDataFor(subscriptionId)),
    );
    if (!stored) {
      throw new Error(`Calendar subscription ${subscriptionId} does not exist`);
    }
  }

  async delete(subscriptionId: CalendarSubscriptionId): Promise<void> {
    await this.store.save(subscriptionId, null);
  }
}
