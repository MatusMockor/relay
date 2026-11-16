import type {
  GoogleCalendarDetails,
  GoogleCalendarPreferences,
  GoogleCalendarRecord,
  GoogleCalendarRepository,
  GoogleCalendarSyncChange,
} from '@relay/engine';
import type { CalendarConnectionId, GoogleCalendarId, UserId } from '@relay/shared/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toGoogleCalendarRecord, toGoogleCalendarRow } from '../mappers/google-calendar-mapper';
import { googleCalendars as calendars } from '../schema';

export class SqliteGoogleCalendarRepository implements GoogleCalendarRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listByUser(userId: UserId): Promise<GoogleCalendarRecord[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(calendars)
        .where(eq(calendars.userId, userId))
        .orderBy(asc(calendars.createdAt), asc(calendars.id))
        .all()
        .map(toGoogleCalendarRecord),
    );
  }

  listByConnection(connectionId: CalendarConnectionId): Promise<GoogleCalendarRecord[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(calendars)
        .where(eq(calendars.connectionId, connectionId))
        .orderBy(asc(calendars.createdAt), asc(calendars.id))
        .all()
        .map(toGoogleCalendarRecord),
    );
  }

  findById(userId: UserId, id: GoogleCalendarId): Promise<GoogleCalendarRecord | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(calendars)
        .where(and(eq(calendars.userId, userId), eq(calendars.id, id)))
        .get();
      return row === undefined ? null : toGoogleCalendarRecord(row);
    });
  }

  save(record: GoogleCalendarRecord): Promise<GoogleCalendarRecord> {
    return this.executor.execute((db) => {
      const values = toGoogleCalendarRow(record);
      const { id: _id, createdAt: _createdAt, ...changes } = values;
      return toGoogleCalendarRecord(
        db
          .insert(calendars)
          .values(values)
          .onConflictDoUpdate({ target: calendars.id, set: changes })
          .returning()
          .get(),
      );
    });
  }

  updateDetails(
    id: GoogleCalendarId,
    details: GoogleCalendarDetails,
  ): Promise<GoogleCalendarRecord | null> {
    return this.executor.execute((db) => {
      const [row] = db.update(calendars).set(details).where(eq(calendars.id, id)).returning().all();
      return row === undefined ? null : toGoogleCalendarRecord(row);
    });
  }

  delete(id: GoogleCalendarId): Promise<void> {
    return this.executor.execute((db) => {
      db.delete(calendars).where(eq(calendars.id, id)).run();
    });
  }

  updatePreferences(
    userId: UserId,
    id: GoogleCalendarId,
    preferences: GoogleCalendarPreferences,
  ): Promise<GoogleCalendarRecord | null> {
    return this.executor.execute((db) => {
      const [row] = db
        .update(calendars)
        .set({
          updatedAt: preferences.updatedAt,
          ...(preferences.enabled === undefined ? {} : { enabled: preferences.enabled }),
          ...(preferences.color === undefined ? {} : { color: preferences.color }),
        })
        .where(and(eq(calendars.userId, userId), eq(calendars.id, id)))
        .returning()
        .all();
      return row === undefined ? null : toGoogleCalendarRecord(row);
    });
  }

  lockForSync(id: GoogleCalendarId): Promise<GoogleCalendarRecord | null> {
    return this.executor.execute((db) => {
      const row = db.select().from(calendars).where(eq(calendars.id, id)).get();
      return row === undefined ? null : toGoogleCalendarRecord(row);
    });
  }

  recordSync(id: GoogleCalendarId, change: GoogleCalendarSyncChange): Promise<void> {
    return this.executor.execute((db) => {
      db.update(calendars)
        .set({
          status: change.status,
          lastError: change.lastError,
          ...(change.syncedAt === null ? {} : { lastSyncedAt: change.syncedAt }),
          ...(change.syncToken === undefined ? {} : { syncToken: change.syncToken }),
        })
        .where(eq(calendars.id, id))
        .run();
    });
  }
}
