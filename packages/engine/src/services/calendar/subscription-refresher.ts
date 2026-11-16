import type { CalendarSubscriptionRecord } from '../../model/calendar';
import type { CalendarAdapters } from '../../ports/calendar-adapters';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { KeyedSerializer } from '../shared/keyed-serializer';
import { errorMessage } from '../shared/mail-provider-sessions';
import { failedFeed, type FeedLoader, type FeedOutcome } from './feed-loader';

export interface SubscriptionRefresherDeps {
  readonly adapters: Pick<CalendarAdapters, 'feedSecrets'>;
  readonly loader: FeedLoader;
  readonly unitOfWork: UnitOfWork;
  readonly notifier: EngineEvents;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class SubscriptionRefresher {
  private readonly serializer = new KeyedSerializer();

  constructor(private readonly deps: SubscriptionRefresherDeps) {}

  refresh(record: CalendarSubscriptionRecord): Promise<void> {
    return this.serializer.run(record.id, () => this.run(record));
  }

  store(record: CalendarSubscriptionRecord, outcome: FeedOutcome): Promise<void> {
    return this.serializer.run(record.id, () => this.save(record, outcome));
  }

  private async run(record: CalendarSubscriptionRecord): Promise<void> {
    const attemptedAt = this.deps.clock.now().toISOString();
    const outcome = await this.fetch(record, attemptedAt).catch((error: unknown): FeedOutcome => {
      this.deps.logger.warn('Calendar feed refresh failed', {
        subscriptionId: record.id,
        error: errorMessage(error),
      });
      return failedFeed(errorMessage(error), attemptedAt);
    });
    await this.save(record, outcome);
  }

  private async save(record: CalendarSubscriptionRecord, outcome: FeedOutcome): Promise<void> {
    const stored = await this.deps.unitOfWork.run(async (repositories) => {
      if (!(await repositories.calendarSubscriptions.lockForRefresh(record.id))) {
        return false;
      }
      if (outcome.events !== null) {
        await repositories.calendarEvents.replaceSubscriptionEvents(record.id, outcome.events);
      }
      await repositories.calendarSubscriptions.recordFetch(record.id, outcome.record);
      return true;
    });
    if (stored) {
      await this.deps.notifier.emit(record.userId, 'calendar.updated', {
        sourceKind: 'subscription',
        sourceId: record.id,
      });
    }
  }

  private async fetch(
    record: CalendarSubscriptionRecord,
    attemptedAt: string,
  ): Promise<FeedOutcome> {
    const url = await this.deps.adapters.feedSecrets.get(record.id);
    if (url === null) {
      return failedFeed('Adresa kalendára chýba.', attemptedAt);
    }
    const validators = {
      etag: record.status === 'ok' ? record.etag : null,
      lastModified: record.status === 'ok' ? record.lastModified : null,
    };
    const owner = { userId: record.userId, subscriptionId: record.id, now: attemptedAt };
    return this.deps.loader.load(url, validators, owner);
  }
}
