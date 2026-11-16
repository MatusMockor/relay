import type {
  CalendarConnectionId,
  CalendarConnectionStatus,
  CalendarEventId,
  GoogleCalendarId,
  GoogleCalendarSyncStatus,
  UserId,
} from '@relay/shared/domain';
import type {
  GoogleCalendarRecord,
  GoogleConnectionRecord,
  GoogleEventRecord,
} from '../model/google-calendar';

export interface GoogleConnectionStatusChange {
  readonly status: CalendarConnectionStatus;
  readonly lastError: string | null;
  readonly attemptedAt: string;
  readonly syncedAt: string | null;
}

export interface GoogleConnectionRepository {
  list(userId: UserId): Promise<GoogleConnectionRecord[]>;
  findById(userId: UserId, id: CalendarConnectionId): Promise<GoogleConnectionRecord | null>;
  findByEmail(userId: UserId, email: string): Promise<GoogleConnectionRecord | null>;
  save(record: GoogleConnectionRecord): Promise<GoogleConnectionRecord>;
  delete(userId: UserId, id: CalendarConnectionId): Promise<boolean>;
  recordSync(id: CalendarConnectionId, change: GoogleConnectionStatusChange): Promise<void>;
  listDue(attemptedBefore: string, limit: number): Promise<GoogleConnectionRecord[]>;
}

export interface GoogleCalendarSyncChange {
  readonly status: GoogleCalendarSyncStatus;
  readonly lastError: string | null;
  readonly syncedAt: string | null;
  readonly syncToken?: string | null;
}

export interface GoogleCalendarPreferences {
  readonly enabled?: boolean;
  readonly color?: string;
  readonly updatedAt: string;
}

export type GoogleCalendarDetails = Pick<
  GoogleCalendarRecord,
  'name' | 'primary' | 'accessRole' | 'timeZone' | 'updatedAt'
>;

export interface GoogleCalendarRepository {
  listByUser(userId: UserId): Promise<GoogleCalendarRecord[]>;
  listByConnection(connectionId: CalendarConnectionId): Promise<GoogleCalendarRecord[]>;
  findById(userId: UserId, id: GoogleCalendarId): Promise<GoogleCalendarRecord | null>;
  save(record: GoogleCalendarRecord): Promise<GoogleCalendarRecord>;
  updateDetails(
    id: GoogleCalendarId,
    details: GoogleCalendarDetails,
  ): Promise<GoogleCalendarRecord | null>;
  delete(id: GoogleCalendarId): Promise<void>;
  updatePreferences(
    userId: UserId,
    id: GoogleCalendarId,
    preferences: GoogleCalendarPreferences,
  ): Promise<GoogleCalendarRecord | null>;
  lockForSync(id: GoogleCalendarId): Promise<GoogleCalendarRecord | null>;
  recordSync(id: GoogleCalendarId, change: GoogleCalendarSyncChange): Promise<void>;
}

export interface GoogleEventRepository {
  findById(userId: UserId, eventId: CalendarEventId): Promise<GoogleEventRecord | null>;
  findByRemoteId(calendarId: GoogleCalendarId, remoteId: string): Promise<GoogleEventRecord | null>;
  findByUid(userId: UserId, uid: string): Promise<GoogleEventRecord[]>;
  save(records: readonly GoogleEventRecord[]): Promise<void>;
  removeSeries(calendarId: GoogleCalendarId, uid: string): Promise<void>;
  replaceCalendar(
    calendarId: GoogleCalendarId,
    records: readonly GoogleEventRecord[],
  ): Promise<void>;
}
