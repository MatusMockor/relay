import type { CalendarRsvpResponse } from '@relay/shared/domain';
import { ConflictError, NotFoundError, ValidationError } from '../../errors';
import type { GoogleCalendarRecord, GoogleEventRecord } from '../../model/google-calendar';
import type { GoogleCalendarGateway } from '../../ports/google-calendar-adapters';
import type { GoogleEventStore } from './google-event-store';
import { GOOGLE_MESSAGES } from './google-messages';

const MAX_ATTEMPTS = 3;

export class GoogleAttendance {
  constructor(
    private readonly gateway: GoogleCalendarGateway,
    private readonly store: GoogleEventStore,
  ) {}

  async respond(
    calendar: GoogleCalendarRecord,
    record: GoogleEventRecord,
    response: CalendarRsvpResponse,
  ): Promise<GoogleEventRecord> {
    const attendeeEmail = record.event.myEmail;
    if (attendeeEmail === null || record.event.myPartstat === null) {
      throw new ValidationError(GOOGLE_MESSAGES.cannotRespond);
    }
    const ref = {
      connectionId: calendar.connectionId,
      calendarRemoteId: calendar.remoteId,
      remoteId: record.remoteId,
    };
    let etag = record.etag;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const result = await this.gateway.setAttendance(
        ref,
        { etag, attendeeEmail, response },
        calendar.timeZone,
      );
      if (result.kind === 'ok') {
        return (await this.store.store(calendar, result.value)) ?? record;
      }
      const fresh =
        result.kind === 'gone' ? null : await this.gateway.getEvent(ref, calendar.timeZone);
      if (fresh === null) {
        await this.store.forget(calendar, record);
        throw new NotFoundError('Google event', record.remoteId);
      }
      await this.store.store(calendar, fresh);
      etag = fresh.etag;
    }
    throw new ConflictError(GOOGLE_MESSAGES.rsvpConflict);
  }
}
