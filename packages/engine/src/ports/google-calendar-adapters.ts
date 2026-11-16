import type { CalendarConnectionId, OAuthCredentials } from '@relay/shared/domain';
import type {
  GoogleAttendanceChange,
  GoogleCalendarSetup,
  GoogleEventDraft,
  GoogleEventListRequest,
  GoogleEventListResult,
  GoogleWriteResult,
  RemoteEventRef,
  RemoteGoogleCalendar,
  RemoteGoogleEvent,
} from '../model/google-calendar';

export interface GoogleCalendarGateway {
  listCalendars(connectionId: CalendarConnectionId): Promise<RemoteGoogleCalendar[]>;
  listEvents(
    connectionId: CalendarConnectionId,
    request: GoogleEventListRequest,
  ): Promise<GoogleEventListResult>;
  getEvent(ref: RemoteEventRef, timeZone: string | null): Promise<RemoteGoogleEvent | null>;
  setAttendance(
    ref: RemoteEventRef,
    change: GoogleAttendanceChange,
    timeZone: string | null,
  ): Promise<GoogleWriteResult<RemoteGoogleEvent>>;
  insertEvent(
    connectionId: CalendarConnectionId,
    calendarRemoteId: string,
    draft: GoogleEventDraft,
  ): Promise<RemoteGoogleEvent>;
  deleteEvent(ref: RemoteEventRef, etag: string): Promise<GoogleWriteResult<null>>;
}

export interface GoogleCalendarCredentials {
  set(connectionId: CalendarConnectionId, credentials: OAuthCredentials): Promise<void>;
  delete(connectionId: CalendarConnectionId): Promise<void>;
}

export interface GoogleCalendarSetupSource {
  setup(): Promise<GoogleCalendarSetup>;
}

export interface GoogleCalendarAdapters {
  readonly gateway: GoogleCalendarGateway;
  readonly credentials: GoogleCalendarCredentials;
  readonly setup: GoogleCalendarSetupSource;
}
