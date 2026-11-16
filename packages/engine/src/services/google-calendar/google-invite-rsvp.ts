import type { CalendarRsvpResponse, UserId } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';
import type { Repositories } from '../../ports/repositories';
import { identityKey } from '../calendar/google-copies';
import type { SeriesMembership } from '../calendar/effective-event';
import type { RemoteRsvp } from '../calendar/remote-rsvp';
import type { GoogleAttendance } from './google-attendance';
import { effectiveGoogleEvent } from './google-effective-event';
import { canRespondToGoogleEvent } from './google-event-access';

export class GoogleInviteRsvp implements RemoteRsvp {
  constructor(
    private readonly repositories: Pick<Repositories, 'googleCalendars' | 'googleEvents'>,
    private readonly attendance: GoogleAttendance,
    private readonly membership: SeriesMembership,
  ) {}

  async respond(
    userId: UserId,
    invite: StoredCalendarEvent,
    response: CalendarRsvpResponse,
  ): Promise<boolean> {
    if (invite.recurrenceId !== null) {
      return false;
    }
    const identity = identityKey(invite);
    if (identity === null) {
      return false;
    }
    const copies = await this.repositories.googleEvents.findByUid(userId, invite.uid);
    const matching = copies.filter(
      (entry) => entry.event.recurrenceId === null && identityKey(entry.event) === identity,
    );
    for (const copy of matching) {
      const calendar = await this.repositories.googleCalendars.findById(userId, copy.calendarId);
      const effective = await effectiveGoogleEvent(
        this.repositories.googleEvents,
        this.membership,
        userId,
        copy,
      );
      if (calendar !== null && canRespondToGoogleEvent(effective.event, calendar.accessRole)) {
        await this.attendance.respond(calendar, copy, response);
        return true;
      }
    }
    return false;
  }
}
