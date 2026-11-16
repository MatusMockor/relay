import type { CalendarRsvpResponse, UserId } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';

export interface RemoteRsvp {
  respond(
    userId: UserId,
    invite: StoredCalendarEvent,
    response: CalendarRsvpResponse,
  ): Promise<boolean>;
}
