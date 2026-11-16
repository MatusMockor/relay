import type { CalendarConnectionId, GoogleCalendarId, UserId } from '@relay/shared/domain';
import type {
  GoogleCalendarDetails,
  GoogleCalendarPreferences,
  GoogleCalendarRecord,
  GoogleCalendarRepository,
  GoogleCalendarSyncChange,
  GoogleConnectionRecord,
  GoogleConnectionRepository,
  GoogleConnectionStatusChange,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

export const removeGoogleCalendar = (db: MemoryDatabase, calendarId: GoogleCalendarId): void => {
  const { tables } = db;
  tables.googleCalendars.delete(calendarId);
  for (const event of [...tables.calendarEvents.values()]) {
    if (event.source.kind === 'google' && event.source.calendarId === calendarId) {
      tables.calendarEvents.delete(event.id);
      tables.googleEventRefs.delete(event.id);
    }
  }
};

export class MemoryGoogleConnectionRepository implements GoogleConnectionRepository {
  constructor(private readonly db: MemoryDatabase) {}

  list(userId: UserId): Promise<GoogleConnectionRecord[]> {
    return Promise.resolve(this.all().filter((record) => record.userId === userId));
  }

  findById(userId: UserId, id: CalendarConnectionId): Promise<GoogleConnectionRecord | null> {
    const record = this.db.tables.googleConnections.get(id);
    return Promise.resolve(record?.userId === userId ? record : null);
  }

  findByEmail(userId: UserId, email: string): Promise<GoogleConnectionRecord | null> {
    const record = this.all().find((entry) => entry.userId === userId && entry.email === email);
    return Promise.resolve(record ?? null);
  }

  save(record: GoogleConnectionRecord): Promise<GoogleConnectionRecord> {
    this.db.tables.googleConnections.set(record.id, record);
    return Promise.resolve(record);
  }

  delete(userId: UserId, id: CalendarConnectionId): Promise<boolean> {
    const record = this.db.tables.googleConnections.get(id);
    if (record?.userId !== userId) {
      return Promise.resolve(false);
    }
    for (const calendar of [...this.db.tables.googleCalendars.values()]) {
      if (calendar.connectionId === id) {
        removeGoogleCalendar(this.db, calendar.id);
      }
    }
    return Promise.resolve(this.db.tables.googleConnections.delete(id));
  }

  recordSync(id: CalendarConnectionId, change: GoogleConnectionStatusChange): Promise<void> {
    const record = this.db.tables.googleConnections.get(id);
    if (record !== undefined) {
      this.db.tables.googleConnections.set(id, {
        ...record,
        status: change.status,
        lastError: change.lastError,
        lastAttemptAt: change.attemptedAt,
        lastSyncedAt: change.syncedAt ?? record.lastSyncedAt,
      });
    }
    return Promise.resolve();
  }

  listDue(attemptedBefore: string, limit: number): Promise<GoogleConnectionRecord[]> {
    const cutoff = Date.parse(attemptedBefore);
    return Promise.resolve(
      this.all()
        .filter((record) => record.status !== 'reauthorize')
        .filter(
          (record) => record.lastAttemptAt === null || Date.parse(record.lastAttemptAt) < cutoff,
        )
        .slice(0, limit),
    );
  }

  private all(): GoogleConnectionRecord[] {
    return [...this.db.tables.googleConnections.values()];
  }
}

export class MemoryGoogleCalendarRepository implements GoogleCalendarRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listByUser(userId: UserId): Promise<GoogleCalendarRecord[]> {
    return Promise.resolve(this.all().filter((record) => record.userId === userId));
  }

  listByConnection(connectionId: CalendarConnectionId): Promise<GoogleCalendarRecord[]> {
    return Promise.resolve(this.all().filter((record) => record.connectionId === connectionId));
  }

  findById(userId: UserId, id: GoogleCalendarId): Promise<GoogleCalendarRecord | null> {
    const record = this.db.tables.googleCalendars.get(id);
    return Promise.resolve(record?.userId === userId ? record : null);
  }

  save(record: GoogleCalendarRecord): Promise<GoogleCalendarRecord> {
    this.db.tables.googleCalendars.set(record.id, record);
    return Promise.resolve(record);
  }

  updateDetails(
    id: GoogleCalendarId,
    details: GoogleCalendarDetails,
  ): Promise<GoogleCalendarRecord | null> {
    const record = this.db.tables.googleCalendars.get(id);
    if (record === undefined) {
      return Promise.resolve(null);
    }
    const updated = { ...record, ...details };
    this.db.tables.googleCalendars.set(id, updated);
    return Promise.resolve(updated);
  }

  delete(id: GoogleCalendarId): Promise<void> {
    removeGoogleCalendar(this.db, id);
    return Promise.resolve();
  }

  updatePreferences(
    userId: UserId,
    id: GoogleCalendarId,
    preferences: GoogleCalendarPreferences,
  ): Promise<GoogleCalendarRecord | null> {
    const record = this.db.tables.googleCalendars.get(id);
    if (record?.userId !== userId) {
      return Promise.resolve(null);
    }
    const updated = {
      ...record,
      enabled: preferences.enabled ?? record.enabled,
      color: preferences.color ?? record.color,
      updatedAt: preferences.updatedAt,
    };
    this.db.tables.googleCalendars.set(id, updated);
    return Promise.resolve(updated);
  }

  lockForSync(id: GoogleCalendarId): Promise<GoogleCalendarRecord | null> {
    return Promise.resolve(this.db.tables.googleCalendars.get(id) ?? null);
  }

  recordSync(id: GoogleCalendarId, change: GoogleCalendarSyncChange): Promise<void> {
    const record = this.db.tables.googleCalendars.get(id);
    if (record !== undefined) {
      this.db.tables.googleCalendars.set(id, {
        ...record,
        status: change.status,
        lastError: change.lastError,
        lastSyncedAt: change.syncedAt ?? record.lastSyncedAt,
        syncToken: change.syncToken === undefined ? record.syncToken : change.syncToken,
      });
    }
    return Promise.resolve();
  }

  private all(): GoogleCalendarRecord[] {
    return [...this.db.tables.googleCalendars.values()];
  }
}
