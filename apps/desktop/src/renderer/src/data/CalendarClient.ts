import type {
  CalendarEventId,
  CalendarInvitation,
  CalendarOccurrence,
  CalendarRsvpResponse,
  CalendarSubscription,
  CalendarSubscriptionId,
  CalendarWindowQuery,
  CreateCalendarSubscriptionBody,
  ThreadId,
  UpdateCalendarSubscriptionBody,
} from '@relay/shared';

export interface CalendarClient {
  listOccurrences(window: CalendarWindowQuery): Promise<CalendarOccurrence[]>;
  listInvitations(threadId: ThreadId, timeZone: string): Promise<CalendarInvitation[]>;
  respondToInvitation(
    eventId: CalendarEventId,
    response: CalendarRsvpResponse,
    timeZone: string,
  ): Promise<CalendarInvitation>;
  listCalendarSubscriptions(): Promise<CalendarSubscription[]>;
  createCalendarSubscription(body: CreateCalendarSubscriptionBody): Promise<CalendarSubscription>;
  updateCalendarSubscription(
    subscriptionId: CalendarSubscriptionId,
    patch: UpdateCalendarSubscriptionBody,
  ): Promise<CalendarSubscription>;
  removeCalendarSubscription(subscriptionId: CalendarSubscriptionId): Promise<void>;
  refreshCalendarSubscription(
    subscriptionId: CalendarSubscriptionId,
  ): Promise<CalendarSubscription>;
}
