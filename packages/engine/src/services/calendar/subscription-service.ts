import type { CalendarSubscription, CalendarSubscriptionId, UserId } from '@relay/shared/domain';
import type {
  CreateCalendarSubscriptionBody,
  UpdateCalendarSubscriptionBody,
} from '@relay/shared/api';
import { NotFoundError, ValidationError } from '../../errors';
import type { CalendarSubscriptionRecord } from '../../model/calendar';
import type { CalendarFeedSecrets } from '../../ports/calendar-adapters';
import type { CalendarSubscriptionRepository } from '../../ports/calendar-subscription-repository';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { FeedOwner } from './feed-events';
import { type FeedLoader, type FeedOutcome, NO_VALIDATORS } from './feed-loader';
import type { SubscriptionRefresher } from './subscription-refresher';
import { toSubscription } from './subscription-view';

export const MAX_SUBSCRIPTIONS_PER_USER = 25;

export interface SubscriptionServiceDeps {
  readonly subscriptions: CalendarSubscriptionRepository;
  readonly secrets: CalendarFeedSecrets;
  readonly refresher: SubscriptionRefresher;
  readonly loader: FeedLoader;
  readonly unitOfWork: UnitOfWork;
  readonly notifier: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

const rejected = (reason: string | null): ValidationError =>
  new ValidationError(`Kalendár sa nepodarilo pridať. ${reason ?? 'Neznáma chyba.'}`);

const hostOf = (url: string): string => {
  const parsed = URL.parse(url);
  if (parsed?.protocol !== 'https:') {
    throw new ValidationError('Adresa kalendára musí používať https.');
  }
  return parsed.hostname;
};

export class SubscriptionService {
  constructor(private readonly deps: SubscriptionServiceDeps) {}

  async list(userId: UserId): Promise<CalendarSubscription[]> {
    return (await this.deps.subscriptions.list(userId)).map(toSubscription);
  }

  async create(
    userId: UserId,
    body: CreateCalendarSubscriptionBody,
  ): Promise<CalendarSubscription> {
    const host = hostOf(body.url);
    const existing = await this.deps.subscriptions.list(userId);
    if (existing.length >= MAX_SUBSCRIPTIONS_PER_USER) {
      throw new ValidationError(
        `Môžeš mať najviac ${String(MAX_SUBSCRIPTIONS_PER_USER)} odoberaných kalendárov.`,
      );
    }
    const now = this.deps.clock.now().toISOString();
    const id = this.deps.ids.generate('calendarSubscription');
    const outcome = await this.firstFetch(body.url, { userId, subscriptionId: id, now });
    const record = await this.deps.subscriptions.create({
      id,
      userId,
      name: body.name,
      color: body.color,
      host,
      status: 'pending',
      lastError: null,
      lastSyncedAt: null,
      eventCount: 0,
      createdAt: now,
      updatedAt: now,
      etag: null,
      lastModified: null,
      lastAttemptAt: now,
    });
    await this.deps.secrets.set(record.id, body.url).catch(async (error: unknown) => {
      await this.deps.subscriptions.delete(userId, record.id);
      throw error;
    });
    await this.deps.refresher.store(record, outcome);
    return toSubscription(await this.require(userId, record.id));
  }

  private async firstFetch(url: string, owner: FeedOwner): Promise<FeedOutcome> {
    const outcome = await this.deps.loader
      .load(url, NO_VALIDATORS, owner)
      .catch((error: unknown) => Promise.reject(rejected(errorMessage(error))));
    if (outcome.events === null) {
      throw rejected(outcome.record.lastError);
    }
    return outcome;
  }

  async update(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
    patch: UpdateCalendarSubscriptionBody,
  ): Promise<CalendarSubscription> {
    const updated = await this.deps.subscriptions.update(userId, subscriptionId, {
      ...patch,
      updatedAt: this.deps.clock.now().toISOString(),
    });
    if (updated === null) {
      throw new NotFoundError('Calendar subscription', subscriptionId);
    }
    await this.notify(userId, subscriptionId);
    return toSubscription(updated);
  }

  async remove(userId: UserId, subscriptionId: CalendarSubscriptionId): Promise<void> {
    await this.require(userId, subscriptionId);
    await this.deps.unitOfWork.run(async (repositories) => {
      await repositories.calendarEvents.replaceSubscriptionEvents(subscriptionId, []);
      await repositories.calendarSubscriptions.delete(userId, subscriptionId);
    });
    await this.deps.secrets.delete(subscriptionId);
    await this.notify(userId, subscriptionId);
  }

  async refresh(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
  ): Promise<CalendarSubscription> {
    await this.deps.refresher.refresh(await this.require(userId, subscriptionId));
    return toSubscription(await this.require(userId, subscriptionId));
  }

  private async require(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
  ): Promise<CalendarSubscriptionRecord> {
    const record = await this.deps.subscriptions.findById(userId, subscriptionId);
    if (record === null) {
      throw new NotFoundError('Calendar subscription', subscriptionId);
    }
    return record;
  }

  private notify(userId: UserId, subscriptionId: CalendarSubscriptionId): Promise<void> {
    return this.deps.notifier.emit(userId, 'calendar.updated', {
      sourceKind: 'subscription',
      sourceId: subscriptionId,
    });
  }
}
