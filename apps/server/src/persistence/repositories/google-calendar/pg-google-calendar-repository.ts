import type {
  GoogleCalendarDetails,
  GoogleCalendarPreferences,
  GoogleCalendarRecord,
  GoogleCalendarRepository,
  GoogleCalendarSyncChange,
} from '@relay/engine';
import type { CalendarConnectionId, GoogleCalendarId, UserId } from '@relay/shared/domain';
import { and, asc, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { googleCalendars as calendars } from '../../schema';
import { toDate } from '../../support/timestamps';
import { toGoogleCalendarInsert, toGoogleCalendarRecord } from './google-calendar.mapper';

export class PgGoogleCalendarRepository implements GoogleCalendarRepository {
  constructor(private readonly db: DbExecutor) {}

  async listByUser(userId: UserId): Promise<GoogleCalendarRecord[]> {
    const rows = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.userId, userId))
      .orderBy(asc(calendars.createdAt), asc(calendars.id));
    return rows.map(toGoogleCalendarRecord);
  }

  async listByConnection(connectionId: CalendarConnectionId): Promise<GoogleCalendarRecord[]> {
    const rows = await this.db
      .select()
      .from(calendars)
      .where(eq(calendars.connectionId, connectionId))
      .orderBy(asc(calendars.createdAt), asc(calendars.id));
    return rows.map(toGoogleCalendarRecord);
  }

  async findById(userId: UserId, id: GoogleCalendarId): Promise<GoogleCalendarRecord | null> {
    const [row] = await this.db
      .select()
      .from(calendars)
      .where(and(eq(calendars.userId, userId), eq(calendars.id, id)));
    return row === undefined ? null : toGoogleCalendarRecord(row);
  }

  async save(record: GoogleCalendarRecord): Promise<GoogleCalendarRecord> {
    const values = toGoogleCalendarInsert(record);
    const { id: _id, createdAt: _createdAt, ...changes } = values;
    const [row] = await this.db
      .insert(calendars)
      .values(values)
      .onConflictDoUpdate({ target: calendars.id, set: changes })
      .returning();
    if (row === undefined) {
      throw new Error(`Google calendar ${record.id} was not stored`);
    }
    return toGoogleCalendarRecord(row);
  }

  async updateDetails(
    id: GoogleCalendarId,
    details: GoogleCalendarDetails,
  ): Promise<GoogleCalendarRecord | null> {
    const [row] = await this.db
      .update(calendars)
      .set({ ...details, updatedAt: toDate(details.updatedAt) })
      .where(eq(calendars.id, id))
      .returning();
    return row === undefined ? null : toGoogleCalendarRecord(row);
  }

  async delete(id: GoogleCalendarId): Promise<void> {
    await this.db.delete(calendars).where(eq(calendars.id, id));
  }

  async updatePreferences(
    userId: UserId,
    id: GoogleCalendarId,
    preferences: GoogleCalendarPreferences,
  ): Promise<GoogleCalendarRecord | null> {
    const [row] = await this.db
      .update(calendars)
      .set({
        updatedAt: toDate(preferences.updatedAt),
        ...(preferences.enabled === undefined ? {} : { enabled: preferences.enabled }),
        ...(preferences.color === undefined ? {} : { color: preferences.color }),
      })
      .where(and(eq(calendars.userId, userId), eq(calendars.id, id)))
      .returning();
    return row === undefined ? null : toGoogleCalendarRecord(row);
  }

  async lockForSync(id: GoogleCalendarId): Promise<GoogleCalendarRecord | null> {
    const [row] = await this.db.select().from(calendars).where(eq(calendars.id, id)).for('update');
    return row === undefined ? null : toGoogleCalendarRecord(row);
  }

  async recordSync(id: GoogleCalendarId, change: GoogleCalendarSyncChange): Promise<void> {
    await this.db
      .update(calendars)
      .set({
        status: change.status,
        lastError: change.lastError,
        ...(change.syncedAt === null ? {} : { lastSyncedAt: toDate(change.syncedAt) }),
        ...(change.syncToken === undefined ? {} : { syncToken: change.syncToken }),
      })
      .where(eq(calendars.id, id));
  }
}
