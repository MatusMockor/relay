import type { UserId } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';
import type { GoogleCalendarRepository } from '../../ports/google-calendar-repositories';

export type VisibleEvent = (event: StoredCalendarEvent) => boolean;

export class GoogleCalendarVisibility {
  constructor(private readonly calendars: GoogleCalendarRepository) {}

  async lookup(userId: UserId): Promise<VisibleEvent> {
    const calendars = await this.calendars.listByUser(userId);
    const enabled = new Set(
      calendars.filter((calendar) => calendar.enabled).map((calendar) => calendar.id),
    );
    return (event) => event.source.kind !== 'google' || enabled.has(event.source.calendarId);
  }
}
