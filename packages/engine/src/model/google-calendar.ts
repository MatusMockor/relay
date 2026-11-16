import type {
  AccountId,
  CalendarConnectionId,
  CalendarConnectionStatus,
  CalendarPartStat,
  GoogleCalendar,
  GoogleCalendarAccessRole,
  GoogleCalendarId,
  UserId,
} from '@relay/shared/domain';
import type { CalendarEventData, StoredCalendarEvent } from './calendar';

export interface GoogleConnectionRecord {
  readonly id: CalendarConnectionId;
  readonly userId: UserId;
  readonly email: string;
  readonly accountId: AccountId | null;
  readonly status: CalendarConnectionStatus;
  readonly lastError: string | null;
  readonly lastSyncedAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GoogleCalendarRecord extends GoogleCalendar {
  readonly userId: UserId;
  readonly remoteId: string;
  readonly syncToken: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RemoteGoogleCalendar {
  readonly remoteId: string;
  readonly name: string;
  readonly color: string | null;
  readonly primary: boolean;
  readonly selected: boolean;
  readonly accessRole: GoogleCalendarAccessRole;
  readonly timeZone: string | null;
}

export interface RemoteEventRef {
  readonly connectionId: CalendarConnectionId;
  readonly calendarRemoteId: string;
  readonly remoteId: string;
}

export interface RemoteGoogleEvent {
  readonly remoteId: string;
  readonly etag: string;
  readonly uid: string | null;
  readonly recurringRemoteId: string | null;
  readonly data: Omit<CalendarEventData, 'uid'>;
  readonly myPartstat: CalendarPartStat | null;
  readonly myEmail: string | null;
}

export type GoogleEventChange =
  | { readonly kind: 'event'; readonly event: RemoteGoogleEvent }
  | { readonly kind: 'removed'; readonly remoteId: string; readonly uid: string | null };

export interface GoogleEventListRequest {
  readonly calendarRemoteId: string;
  readonly timeZone: string | null;
  readonly syncToken: string | null;
  readonly pageToken: string | null;
  readonly timeMin: string | null;
}

export type GoogleEventListResult =
  | { readonly kind: 'expired' }
  | {
      readonly kind: 'page';
      readonly changes: readonly GoogleEventChange[];
      readonly nextPageToken: string | null;
      readonly nextSyncToken: string | null;
    };

export type GoogleWriteResult<Value> =
  | { readonly kind: 'ok'; readonly value: Value }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'gone' };

export interface GoogleEventDraft {
  readonly title: string;
  readonly allDay: boolean;
  readonly start: string;
  readonly end: string;
  readonly timeZone: string;
  readonly location: string | null;
  readonly attendees: readonly string[];
}

export interface GoogleAttendanceChange {
  readonly etag: string;
  readonly attendeeEmail: string;
  readonly response: 'accepted' | 'tentative' | 'declined';
}

export interface GoogleEventRecord {
  readonly event: StoredCalendarEvent;
  readonly calendarId: GoogleCalendarId;
  readonly remoteId: string;
  readonly etag: string;
}

export interface GoogleCalendarSetup {
  readonly configured: boolean;
  readonly setupHint: string | null;
}
