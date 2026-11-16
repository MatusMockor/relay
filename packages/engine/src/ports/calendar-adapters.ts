import type { Address, CalendarRsvpResponse, CalendarSubscriptionId } from '@relay/shared/domain';
import type {
  CalendarFeedResult,
  CalendarFeedValidators,
  CalendarSeries,
  CalendarWindow,
  ExpandedOccurrence,
  ParsedCalendar,
  StoredCalendarEvent,
} from '../model/calendar';

export interface CalendarParser {
  parse(text: string): ParsedCalendar | null;
}

export interface CalendarExpander {
  expand(series: CalendarSeries, window: CalendarWindow): ExpandedOccurrence[];
  seriesRangeEnd(
    master: StoredCalendarEvent,
    overrides: readonly StoredCalendarEvent[],
  ): string | null;
  isOrphaned(master: StoredCalendarEvent, override: StoredCalendarEvent): boolean;
}

export interface CalendarReplyInput {
  readonly event: StoredCalendarEvent;
  readonly attendee: Address;
  readonly response: CalendarRsvpResponse;
  readonly dtstamp: string;
}

export interface CalendarReplyBuilder {
  build(input: CalendarReplyInput): string;
}

export interface CalendarFeedFetcher {
  fetch(url: string, validators: CalendarFeedValidators): Promise<CalendarFeedResult>;
}

export interface CalendarFeedSecrets {
  get(subscriptionId: CalendarSubscriptionId): Promise<string | null>;
  set(subscriptionId: CalendarSubscriptionId, url: string): Promise<void>;
  delete(subscriptionId: CalendarSubscriptionId): Promise<void>;
}

export interface CalendarAdapters {
  readonly parser: CalendarParser;
  readonly expander: CalendarExpander;
  readonly replyBuilder: CalendarReplyBuilder;
  readonly feedFetcher: CalendarFeedFetcher;
  readonly feedSecrets: CalendarFeedSecrets;
}
