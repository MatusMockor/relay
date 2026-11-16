import type {
  CalendarEventId,
  CalendarInvitation,
  CalendarOccurrence,
  CalendarRsvpResponse,
  CalendarSubscription,
  CalendarSubscriptionId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type {
  CreateCalendarSubscriptionBody,
  UpdateCalendarSubscriptionBody,
} from '@relay/shared/api';
import type { CalendarWindow } from '../../model/calendar';
import type { DueSubscriptions } from './due-subscriptions';
import type { InvitationQuery } from './invitation-query';
import type { OccurrenceQuery } from './occurrence-query';
import type { RsvpService } from './rsvp-service';
import type { SubscriptionService } from './subscription-service';

export interface CalendarServiceParts {
  readonly occurrences: OccurrenceQuery;
  readonly invitations: InvitationQuery;
  readonly rsvp: RsvpService;
  readonly subscriptions: SubscriptionService;
  readonly due: DueSubscriptions;
}

export class CalendarService {
  constructor(private readonly parts: CalendarServiceParts) {}

  occurrences(userId: UserId, window: CalendarWindow): Promise<CalendarOccurrence[]> {
    return this.parts.occurrences.list(userId, window);
  }

  invitations(userId: UserId, threadId: ThreadId, timeZone: string): Promise<CalendarInvitation[]> {
    return this.parts.invitations.forThread(userId, threadId, timeZone);
  }

  respond(
    userId: UserId,
    eventId: CalendarEventId,
    response: CalendarRsvpResponse,
    timeZone: string,
  ): Promise<CalendarInvitation> {
    return this.parts.rsvp.respond(userId, eventId, response, timeZone);
  }

  listSubscriptions(userId: UserId): Promise<CalendarSubscription[]> {
    return this.parts.subscriptions.list(userId);
  }

  createSubscription(
    userId: UserId,
    body: CreateCalendarSubscriptionBody,
  ): Promise<CalendarSubscription> {
    return this.parts.subscriptions.create(userId, body);
  }

  updateSubscription(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
    patch: UpdateCalendarSubscriptionBody,
  ): Promise<CalendarSubscription> {
    return this.parts.subscriptions.update(userId, subscriptionId, patch);
  }

  deleteSubscription(userId: UserId, subscriptionId: CalendarSubscriptionId): Promise<void> {
    return this.parts.subscriptions.remove(userId, subscriptionId);
  }

  refreshSubscription(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
  ): Promise<CalendarSubscription> {
    return this.parts.subscriptions.refresh(userId, subscriptionId);
  }

  refreshDueSubscriptions(): Promise<number> {
    return this.parts.due.refreshDue();
  }
}
