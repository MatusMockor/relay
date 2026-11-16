import type { CalendarEventId, GoogleCalendarId, UserId } from '@relay/shared/domain';
import type { GoogleEventRecord, GoogleEventRepository, StoredCalendarEvent } from '../../../src';
import type { MemoryDatabase } from './memory-database';

const inCalendar = (event: StoredCalendarEvent, calendarId: GoogleCalendarId): boolean =>
  event.source.kind === 'google' && event.source.calendarId === calendarId;

export class MemoryGoogleEventRepository implements GoogleEventRepository {
  constructor(private readonly db: MemoryDatabase) {}

  findById(userId: UserId, eventId: CalendarEventId): Promise<GoogleEventRecord | null> {
    const event = this.db.tables.calendarEvents.get(eventId);
    if (event?.userId !== userId) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.recordOf(event));
  }

  findByRemoteId(
    calendarId: GoogleCalendarId,
    remoteId: string,
  ): Promise<GoogleEventRecord | null> {
    const record = this.records().find(
      (entry) => entry.calendarId === calendarId && entry.remoteId === remoteId,
    );
    return Promise.resolve(record ?? null);
  }

  findByUid(userId: UserId, uid: string): Promise<GoogleEventRecord[]> {
    return Promise.resolve(
      this.records().filter((entry) => entry.event.userId === userId && entry.event.uid === uid),
    );
  }

  save(records: readonly GoogleEventRecord[]): Promise<void> {
    for (const record of records) {
      const existing = [...this.db.tables.calendarEvents.values()].find(
        (event) =>
          inCalendar(event, record.calendarId) &&
          event.uid === record.event.uid &&
          event.recurrenceId === record.event.recurrenceId,
      );
      const id = existing?.id ?? record.event.id;
      this.db.tables.calendarEvents.set(id, {
        ...record.event,
        id,
        revision: Math.max(existing?.revision ?? 0, record.event.revision) + 1,
      });
      this.db.tables.googleEventRefs.set(id, { remoteId: record.remoteId, etag: record.etag });
    }
    return Promise.resolve();
  }

  removeSeries(calendarId: GoogleCalendarId, uid: string): Promise<void> {
    for (const event of [...this.db.tables.calendarEvents.values()]) {
      if (inCalendar(event, calendarId) && event.uid === uid) {
        this.db.tables.calendarEvents.delete(event.id);
        this.db.tables.googleEventRefs.delete(event.id);
      }
    }
    return Promise.resolve();
  }

  async replaceCalendar(
    calendarId: GoogleCalendarId,
    records: readonly GoogleEventRecord[],
  ): Promise<void> {
    const previous = [...this.db.tables.calendarEvents.values()].filter((event) =>
      inCalendar(event, calendarId),
    );
    const carried = records.map((record) => {
      const known = previous.find(
        (event) =>
          event.uid === record.event.uid && event.recurrenceId === record.event.recurrenceId,
      );
      const revision = Math.max(known?.revision ?? 0, record.event.revision);
      return { ...record, event: { ...record.event, revision } };
    });
    for (const event of previous) {
      this.db.tables.calendarEvents.delete(event.id);
      this.db.tables.googleEventRefs.delete(event.id);
    }
    await this.save(carried);
  }

  private records(): GoogleEventRecord[] {
    return [...this.db.tables.calendarEvents.values()].flatMap((event) => {
      const record = this.recordOf(event);
      return record === null ? [] : [record];
    });
  }

  private recordOf(event: StoredCalendarEvent): GoogleEventRecord | null {
    const ref = this.db.tables.googleEventRefs.get(event.id);
    if (event.source.kind !== 'google' || ref === undefined) {
      return null;
    }
    return { event, calendarId: event.source.calendarId, ...ref };
  }
}
