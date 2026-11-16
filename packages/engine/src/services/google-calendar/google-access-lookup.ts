import type { UserId } from '@relay/shared/domain';
import type { GoogleCalendarRepository } from '../../ports/google-calendar-repositories';
import type { AccessLookup } from '../calendar/occurrence-mapper';
import { accessOf } from './google-event-access';

export class GoogleAccessLookup {
  constructor(private readonly calendars: GoogleCalendarRepository) {}

  async lookup(userId: UserId): Promise<AccessLookup> {
    const calendars = await this.calendars.listByUser(userId);
    const roles = new Map(calendars.map((calendar) => [calendar.id, calendar.accessRole]));
    return ({ event }) =>
      accessOf(
        event,
        event.source.kind === 'google' ? roles.get(event.source.calendarId) : undefined,
      );
  }
}
