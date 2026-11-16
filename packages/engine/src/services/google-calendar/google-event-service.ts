import type {
  CalendarEventId,
  CalendarRsvpResponse,
  GoogleCalendarId,
  UserId,
} from '@relay/shared/domain';
import type { CreateCalendarEventBody, CreatedCalendarEvent } from '@relay/shared/api';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ProviderError,
  ValidationError,
} from '../../errors';
import type { GoogleCalendarRecord, GoogleEventRecord } from '../../model/google-calendar';
import type { Clock } from '../../ports/clock';
import type { GoogleCalendarGateway } from '../../ports/google-calendar-adapters';
import type { Repositories } from '../../ports/repositories';
import type { InviteResponses } from '../calendar/invite-responses';
import type { GoogleAttendance } from './google-attendance';
import { canDeleteGoogleEvent, canRespondToGoogleEvent } from './google-event-access';
import type { GoogleEventStore } from './google-event-store';
import { GOOGLE_MESSAGES } from './google-messages';
import { isWritableAccessRole } from '@relay/shared/domain';

export interface GoogleEventServiceDeps {
  readonly repositories: Pick<Repositories, 'googleCalendars' | 'googleEvents'>;
  readonly gateway: GoogleCalendarGateway;
  readonly store: GoogleEventStore;
  readonly attendance: GoogleAttendance;
  readonly responses: InviteResponses;
  readonly clock: Clock;
}

interface LoadedEvent {
  readonly calendar: GoogleCalendarRecord;
  readonly record: GoogleEventRecord;
}

export class GoogleEventService {
  constructor(private readonly deps: GoogleEventServiceDeps) {}

  async create(userId: UserId, body: CreateCalendarEventBody): Promise<CreatedCalendarEvent> {
    const calendar = await this.calendar(userId, body.calendarId);
    if (!isWritableAccessRole(calendar.accessRole)) {
      throw new ForbiddenError(GOOGLE_MESSAGES.readOnly);
    }
    if (!calendar.enabled) {
      throw new ValidationError(GOOGLE_MESSAGES.disabled);
    }
    const remote = await this.deps.gateway.insertEvent(calendar.connectionId, calendar.remoteId, {
      title: body.title,
      allDay: body.allDay,
      start: body.start,
      end: body.end,
      timeZone: body.timeZone,
      location: body.location === '' ? null : body.location,
      attendees: body.attendees,
    });
    const record = await this.deps.store.store(calendar, remote);
    if (record !== null) {
      return { eventId: record.event.id };
    }
    if (!(await this.calendar(userId, calendar.id)).enabled) {
      throw new ConflictError(GOOGLE_MESSAGES.createdInDisabled);
    }
    throw new ProviderError('Google did not return the created event');
  }

  async remove(userId: UserId, eventId: CalendarEventId): Promise<void> {
    const loaded = await this.load(userId, eventId);
    const { calendar } = loaded;
    const record = await this.seriesRoot(userId, loaded);
    if (!canDeleteGoogleEvent(record.event, calendar.accessRole)) {
      throw new ForbiddenError(GOOGLE_MESSAGES.notOwn);
    }
    const ref = {
      connectionId: calendar.connectionId,
      calendarRemoteId: calendar.remoteId,
      remoteId: record.remoteId,
    };
    const result = await this.deps.gateway.deleteEvent(ref, record.etag);
    if (result.kind !== 'conflict') {
      await this.deps.store.forget(calendar, record);
      return;
    }
    const fresh = await this.deps.gateway.getEvent(ref, calendar.timeZone);
    if (fresh === null) {
      await this.deps.store.forget(calendar, record);
      return;
    }
    await this.deps.store.store(calendar, fresh);
    throw new ConflictError(GOOGLE_MESSAGES.deleteConflict);
  }

  async respond(
    userId: UserId,
    eventId: CalendarEventId,
    response: CalendarRsvpResponse,
  ): Promise<void> {
    const { calendar, record } = await this.load(userId, eventId);
    if (!canRespondToGoogleEvent(record.event, calendar.accessRole)) {
      throw new ForbiddenError(GOOGLE_MESSAGES.cannotRespond);
    }
    const repliedAt = this.deps.clock.now().toISOString();
    const answered = await this.deps.attendance.respond(calendar, record, response);
    await this.deps.responses.reconcile(userId, answered.event, { partstat: response, repliedAt });
  }

  private async seriesRoot(userId: UserId, loaded: LoadedEvent): Promise<GoogleEventRecord> {
    if (loaded.record.event.recurrenceId === null) {
      return loaded.record;
    }
    const copies = await this.deps.repositories.googleEvents.findByUid(
      userId,
      loaded.record.event.uid,
    );
    const master = copies.find(
      (copy) => copy.calendarId === loaded.calendar.id && copy.event.recurrenceId === null,
    );
    return master ?? loaded.record;
  }

  private async load(userId: UserId, eventId: CalendarEventId): Promise<LoadedEvent> {
    const record = await this.deps.repositories.googleEvents.findById(userId, eventId);
    if (record === null) {
      throw new NotFoundError('Calendar event', eventId);
    }
    return { calendar: await this.calendar(userId, record.calendarId), record };
  }

  private async calendar(
    userId: UserId,
    calendarId: GoogleCalendarId,
  ): Promise<GoogleCalendarRecord> {
    const calendar = await this.deps.repositories.googleCalendars.findById(userId, calendarId);
    if (calendar === null) {
      throw new NotFoundError('Google calendar', calendarId);
    }
    return calendar;
  }
}
