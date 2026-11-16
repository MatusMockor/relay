import type { CalendarInvitation, CalendarOccurrence } from '@relay/shared/domain';

export interface CalendarRangeQuery {
  readonly from: string;
  readonly to: string;
  readonly limit: number;
}

export interface CalendarEventsResult {
  readonly timeZone: string;
  readonly occurrences: readonly CalendarOccurrence[];
}

export interface ThreadEventsResult {
  readonly timeZone: string;
  readonly invitations: readonly CalendarInvitation[];
}
