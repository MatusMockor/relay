import type {
  AccountId,
  Address,
  CalendarAttendee,
  CalendarEventId,
  CalendarEventStatus,
  CalendarMethod,
  CalendarPartStat,
  CalendarSubscription,
  CalendarSubscriptionId,
  GoogleCalendarId,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';

export interface CalendarRevision {
  readonly sequence: number;
  readonly dtstamp: string | null;
}

export interface CalendarEventData {
  readonly uid: string;
  readonly recurrenceId: string | null;
  readonly thisAndFuture?: boolean;
  readonly endsSeries?: boolean;
  readonly sequence: number;
  readonly dtstamp: string | null;
  readonly status: CalendarEventStatus;
  readonly summary: string;
  readonly location: string | null;
  readonly description: string | null;
  readonly organizer: Address | null;
  readonly attendees: readonly CalendarAttendee[];
  readonly allDay: boolean;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly recurring: boolean;
  readonly rangeEndsAt: string | null;
  readonly ics: string;
}

export interface ParsedCalendarEvent extends CalendarEventData {
  readonly timed: boolean;
}

export interface ParsedCalendar {
  readonly method: CalendarMethod | null;
  readonly events: readonly ParsedCalendarEvent[];
}

export type CalendarSource =
  | { readonly kind: 'invite'; readonly accountId: AccountId }
  | { readonly kind: 'subscription'; readonly subscriptionId: CalendarSubscriptionId }
  | { readonly kind: 'google'; readonly calendarId: GoogleCalendarId };

export interface StoredCalendarEvent extends CalendarEventData {
  readonly id: CalendarEventId;
  readonly userId: UserId;
  readonly source: CalendarSource;
  readonly method: CalendarMethod | null;
  readonly myPartstat: CalendarPartStat | null;
  readonly myEmail: string | null;
  readonly messageId: MessageId | null;
  readonly threadId: ThreadId | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revision: number;
}

export interface CalendarSeries {
  readonly master: StoredCalendarEvent | null;
  readonly overrides: readonly StoredCalendarEvent[];
}

export interface CalendarRange {
  readonly from: string;
  readonly to: string;
}

export interface CalendarWindow extends CalendarRange {
  readonly timeZone: string;
}

export interface ExpandedOccurrence {
  readonly event: StoredCalendarEvent;
  readonly recurrenceId: string | null;
  readonly start: string;
  readonly end: string;
  readonly allDay: boolean;
}

export interface CalendarSubscriptionRecord extends CalendarSubscription {
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly lastAttemptAt: string | null;
}

export interface CalendarFeedValidators {
  readonly etag: string | null;
  readonly lastModified: string | null;
}

export type CalendarFeedResult =
  | { readonly kind: 'not-modified' }
  | {
      readonly kind: 'fetched';
      readonly body: string;
      readonly etag: string | null;
      readonly lastModified: string | null;
    };
