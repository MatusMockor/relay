import type {
  CalendarConnectionId,
  CalendarEventId,
  CalendarRsvpResponse,
  CreateCalendarEventBody,
  CreatedCalendarEvent,
  GoogleCalendar,
  GoogleCalendarConnection,
  GoogleCalendarId,
  GoogleCalendarOverview,
  OAuthGrant,
  UpdateGoogleCalendarBody,
} from '@relay/shared';

export interface GoogleCalendarClient {
  googleCalendarOverview(): Promise<GoogleCalendarOverview>;
  connectGoogleCalendar(grant: OAuthGrant): Promise<GoogleCalendarConnection>;
  disconnectGoogleCalendar(connectionId: CalendarConnectionId): Promise<void>;
  syncGoogleCalendar(connectionId: CalendarConnectionId): Promise<GoogleCalendarConnection>;
  updateGoogleCalendar(
    calendarId: GoogleCalendarId,
    patch: UpdateGoogleCalendarBody,
  ): Promise<GoogleCalendar>;
  createCalendarEvent(body: CreateCalendarEventBody): Promise<CreatedCalendarEvent>;
  deleteCalendarEvent(eventId: CalendarEventId): Promise<void>;
  respondToCalendarEvent(eventId: CalendarEventId, response: CalendarRsvpResponse): Promise<void>;
}
