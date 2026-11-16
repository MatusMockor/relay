import type { CalendarFetchRecord } from '../../ports/calendar-subscription-repository';
import type { CalendarAdapters } from '../../ports/calendar-adapters';
import type { IdGenerator } from '../../ports/id-generator';
import type { CalendarFeedValidators, StoredCalendarEvent } from '../../model/calendar';
import { feedEvents, type FeedOwner } from './feed-events';
import { withSeriesRanges } from './feed-series-ranges';

export interface FeedOutcome {
  readonly record: CalendarFetchRecord;
  readonly events: StoredCalendarEvent[] | null;
}

export const failedFeed = (lastError: string, attemptedAt: string): FeedOutcome => ({
  record: { status: 'error', lastError, attemptedAt, syncedAt: null },
  events: null,
});

export const NO_VALIDATORS: CalendarFeedValidators = { etag: null, lastModified: null };

export class FeedLoader {
  constructor(
    private readonly adapters: Pick<CalendarAdapters, 'feedFetcher' | 'parser' | 'expander'>,
    private readonly ids: IdGenerator,
  ) {}

  async load(
    url: string,
    validators: CalendarFeedValidators,
    owner: FeedOwner,
  ): Promise<FeedOutcome> {
    const attemptedAt = owner.now;
    const result = await this.adapters.feedFetcher.fetch(url, validators);
    if (result.kind === 'not-modified') {
      return {
        record: { status: 'ok', lastError: null, attemptedAt, syncedAt: attemptedAt },
        events: null,
      };
    }
    const calendar = this.adapters.parser.parse(result.body);
    if (calendar === null) {
      return failedFeed('Súbor nie je platný iCalendar.', attemptedAt);
    }
    const events = withSeriesRanges(feedEvents(this.ids, owner, calendar), this.adapters.expander);
    return {
      record: {
        status: 'ok',
        lastError: null,
        attemptedAt,
        syncedAt: attemptedAt,
        etag: result.etag,
        lastModified: result.lastModified,
        eventCount: events.length,
      },
      events,
    };
  }
}
