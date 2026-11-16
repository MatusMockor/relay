import type {
  CalendarConnectionId,
  CalendarEventId,
  CalendarRsvpResponse,
  GoogleCalendar,
  GoogleCalendarConnection,
  GoogleCalendarId,
  GoogleCalendarOverview,
  UserId,
} from '@relay/shared/domain';
import type {
  CreateCalendarEventBody,
  CreatedCalendarEvent,
  UpdateGoogleCalendarBody,
} from '@relay/shared/api';
import type { DueGoogleConnections } from './due-google-connections';
import type { GoogleConnectInput, GoogleConnectionService } from './google-connection-service';
import type { GoogleEventService } from './google-event-service';

export interface GoogleCalendarServiceParts {
  readonly connections: GoogleConnectionService;
  readonly events: GoogleEventService;
  readonly due: DueGoogleConnections;
}

export class GoogleCalendarService {
  constructor(private readonly parts: GoogleCalendarServiceParts) {}

  overview(userId: UserId): Promise<GoogleCalendarOverview> {
    return this.parts.connections.overview(userId);
  }

  connect(userId: UserId, input: GoogleConnectInput): Promise<GoogleCalendarConnection> {
    return this.parts.connections.connect(userId, input);
  }

  disconnect(userId: UserId, connectionId: CalendarConnectionId): Promise<void> {
    return this.parts.connections.disconnect(userId, connectionId);
  }

  sync(userId: UserId, connectionId: CalendarConnectionId): Promise<GoogleCalendarConnection> {
    return this.parts.connections.sync(userId, connectionId);
  }

  updateCalendar(
    userId: UserId,
    calendarId: GoogleCalendarId,
    patch: UpdateGoogleCalendarBody,
  ): Promise<GoogleCalendar> {
    return this.parts.connections.updateCalendar(userId, calendarId, patch);
  }

  createEvent(userId: UserId, body: CreateCalendarEventBody): Promise<CreatedCalendarEvent> {
    return this.parts.events.create(userId, body);
  }

  deleteEvent(userId: UserId, eventId: CalendarEventId): Promise<void> {
    return this.parts.events.remove(userId, eventId);
  }

  respond(userId: UserId, eventId: CalendarEventId, response: CalendarRsvpResponse): Promise<void> {
    return this.parts.events.respond(userId, eventId, response);
  }

  syncDue(): Promise<number> {
    return this.parts.due.syncDue();
  }
}
