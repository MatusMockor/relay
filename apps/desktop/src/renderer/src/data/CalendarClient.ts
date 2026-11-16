import type {
  CalendarEventId,
  CalendarInvitation,
  CalendarOccurrence,
  CalendarRsvpResponse,
  CalendarSubscription,
  CalendarSubscriptionId,
  CalendarWindowQuery,
  CreateCalendarSubscriptionBody,
  FailedInvitation,
  FailedInvitationRef,
  FailedInvitationRetry,
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
  listFailedInvitations(): Promise<FailedInvitation[]>;
  retryFailedInvitation(ref: FailedInvitationRef): Promise<FailedInvitationRetry>;
  dismissFailedInvitation(ref: FailedInvitationRef): Promise<void>;
}
