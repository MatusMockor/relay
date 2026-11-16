import type { CalendarSubscriptionId } from '@relay/shared/domain';
import type {
  CalendarAdapters,
  CalendarExpander,
  CalendarFeedFetcher,
  CalendarFeedResult,
  CalendarFeedSecrets,
  CalendarParser,
  CalendarReplyBuilder,
  CalendarReplyInput,
  CalendarSeries,
  CalendarWindow,
  ExpandedOccurrence,
  ParsedCalendar,
} from '../../../src';

export class MapCalendarParser implements CalendarParser {
  private readonly calendars = new Map<string, ParsedCalendar>();

  register(token: string, calendar: ParsedCalendar): void {
    this.calendars.set(token, calendar);
  }

  parse(text: string): ParsedCalendar | null {
    return this.calendars.get(text.trim()) ?? null;
  }
}

export class StoredTimesExpander implements CalendarExpander {
  expand(series: CalendarSeries, window: CalendarWindow): ExpandedOccurrence[] {
    const rows = [...(series.master === null ? [] : [series.master]), ...series.overrides];
    return rows
      .filter(
        (row) =>
          Date.parse(row.startsAt) < Date.parse(window.to) &&
          Date.parse(row.endsAt) > Date.parse(window.from),
      )
      .map((row) => ({
        event: row,
        recurrenceId: row.recurrenceId,
        start: row.startsAt,
        end: row.endsAt,
        allDay: row.allDay,
      }));
  }
}

export class TemplateReplyBuilder implements CalendarReplyBuilder {
  readonly built: CalendarReplyInput[] = [];

  build(input: CalendarReplyInput): string {
    this.built.push(input);
    return `REPLY ${input.event.uid} ${input.attendee.email} ${input.response}`;
  }
}

export class MemoryFeedFetcher implements CalendarFeedFetcher {
  readonly feeds = new Map<string, CalendarFeedResult | Error>();
  readonly requests: { url: string; etag: string | null }[] = [];

  fetch(url: string, validators: { etag: string | null }): Promise<CalendarFeedResult> {
    this.requests.push({ url, etag: validators.etag });
    const feed = this.feeds.get(url);
    if (feed === undefined) {
      return Promise.reject(new Error('Server vrátil stav 404.'));
    }
    if (feed instanceof Error) {
      return Promise.reject(feed);
    }
    return Promise.resolve(feed);
  }
}

export class MemoryFeedSecrets implements CalendarFeedSecrets {
  readonly urls = new Map<CalendarSubscriptionId, string>();

  get(subscriptionId: CalendarSubscriptionId): Promise<string | null> {
    return Promise.resolve(this.urls.get(subscriptionId) ?? null);
  }

  set(subscriptionId: CalendarSubscriptionId, url: string): Promise<void> {
    this.urls.set(subscriptionId, url);
    return Promise.resolve();
  }

  delete(subscriptionId: CalendarSubscriptionId): Promise<void> {
    this.urls.delete(subscriptionId);
    return Promise.resolve();
  }
}

export interface CalendarFakes extends CalendarAdapters {
  readonly parser: MapCalendarParser;
  readonly replyBuilder: TemplateReplyBuilder;
  readonly feedFetcher: MemoryFeedFetcher;
  readonly feedSecrets: MemoryFeedSecrets;
}

export const createCalendarFakes = (): CalendarFakes => ({
  parser: new MapCalendarParser(),
  expander: new StoredTimesExpander(),
  replyBuilder: new TemplateReplyBuilder(),
  feedFetcher: new MemoryFeedFetcher(),
  feedSecrets: new MemoryFeedSecrets(),
});
