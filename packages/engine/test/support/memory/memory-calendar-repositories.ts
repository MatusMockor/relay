import type {
  CalendarEventId,
  CalendarSubscriptionId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import {
  type CalendarEventRepository,
  type CalendarFetchRecord,
  type CalendarRange,
  type CalendarResponseChange,
  type CalendarSource,
  type CalendarSubscriptionChanges,
  type CalendarSubscriptionRecord,
  type CalendarSubscriptionRepository,
  sameSlot,
  type StoredCalendarEvent,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';

const sourceOf = (source: CalendarSource): string => {
  if (source.kind === 'invite') {
    return source.accountId;
  }
  if (source.kind === 'subscription') {
    return source.subscriptionId;
  }
  return source.calendarId;
};

const overlaps = (event: StoredCalendarEvent, range: CalendarRange): boolean =>
  Date.parse(event.startsAt) < Date.parse(range.to) &&
  (event.rangeEndsAt === null || Date.parse(event.rangeEndsAt) > Date.parse(range.from));

export class MemoryCalendarEventRepository implements CalendarEventRepository {
  beforeUpdateResponse: ((eventId: CalendarEventId) => Promise<void>) | null = null;
  beforeWrite: ((event: StoredCalendarEvent) => Promise<void>) | null = null;
  failUpsertUid: string | null = null;

  constructor(private readonly db: MemoryDatabase) {}

  findById(userId: UserId, eventId: CalendarEventId): Promise<StoredCalendarEvent | null> {
    const event = this.db.tables.calendarEvents.get(eventId);
    return Promise.resolve(event?.userId === userId ? event : null);
  }

  findSeries(source: CalendarSource, uid: string): Promise<StoredCalendarEvent[]> {
    return Promise.resolve(
      this.all().filter(
        (event) => sourceOf(event.source) === sourceOf(source) && event.uid === uid,
      ),
    );
  }

  listForRange(userId: UserId, range: CalendarRange): Promise<StoredCalendarEvent[]> {
    const owned = this.all().filter((event) => event.userId === userId);
    const hits = owned.filter((event) => overlaps(event, range));
    const series = new Set(hits.map((event) => `${sourceOf(event.source)}:${event.uid}`));
    return Promise.resolve(
      owned.filter((event) => series.has(`${sourceOf(event.source)}:${event.uid}`)),
    );
  }

  listByThread(userId: UserId, threadId: ThreadId): Promise<StoredCalendarEvent[]> {
    return Promise.resolve(
      this.all().filter((event) => event.userId === userId && event.threadId === threadId),
    );
  }

  async upsert(event: StoredCalendarEvent): Promise<StoredCalendarEvent> {
    await this.beforeStoring(event);
    const existing = this.instanceOf(event);
    const stored = {
      ...event,
      id: existing?.id ?? event.id,
      revision: (existing?.revision ?? 0) + 1,
    };
    this.db.tables.calendarEvents.set(stored.id, stored);
    return stored;
  }

  async saveIfCurrent(event: StoredCalendarEvent): Promise<StoredCalendarEvent | null> {
    await this.beforeStoring(event);
    if (!this.isCurrent(event)) {
      return null;
    }
    const stored = { ...event, revision: event.revision + 1 };
    this.db.tables.calendarEvents.set(stored.id, stored);
    return stored;
  }

  async updateResponse(
    eventId: CalendarEventId,
    change: CalendarResponseChange,
  ): Promise<StoredCalendarEvent | null> {
    await this.beforeUpdateResponse?.(eventId);
    const event = this.db.tables.calendarEvents.get(eventId);
    if (event === undefined || event.revision !== change.expectedRevision) {
      return null;
    }
    const updated: StoredCalendarEvent = {
      ...event,
      myPartstat: change.myPartstat,
      attendees: [...change.attendees],
      updatedAt: change.updatedAt,
      revision: event.revision + 1,
    };
    this.db.tables.calendarEvents.set(eventId, updated);
    return updated;
  }

  replaceSubscriptionEvents(
    subscriptionId: CalendarSubscriptionId,
    events: readonly StoredCalendarEvent[],
  ): Promise<void> {
    for (const event of this.all()) {
      if (event.source.kind === 'subscription' && event.source.subscriptionId === subscriptionId) {
        this.db.tables.calendarEvents.delete(event.id);
      }
    }
    for (const event of events) {
      this.db.tables.calendarEvents.set(event.id, { ...event, revision: 1 });
    }
    return Promise.resolve();
  }

  private async beforeStoring(event: StoredCalendarEvent): Promise<void> {
    if (this.failUpsertUid === event.uid) {
      throw new Error(`Storing ${event.uid} failed`);
    }
    await this.beforeWrite?.(event);
  }

  private isCurrent(event: StoredCalendarEvent): boolean {
    if (event.revision === 0) {
      return this.instanceOf(event) === undefined;
    }
    return this.db.tables.calendarEvents.get(event.id)?.revision === event.revision;
  }

  private instanceOf(event: StoredCalendarEvent): StoredCalendarEvent | undefined {
    return this.all().find(
      (row) =>
        sourceOf(row.source) === sourceOf(event.source) &&
        row.uid === event.uid &&
        sameSlot(row, event),
    );
  }

  private all(): StoredCalendarEvent[] {
    return [...this.db.tables.calendarEvents.values()];
  }
}

export class MemoryCalendarSubscriptionRepository implements CalendarSubscriptionRepository {
  constructor(private readonly db: MemoryDatabase) {}

  list(userId: UserId): Promise<CalendarSubscriptionRecord[]> {
    return Promise.resolve(this.all().filter((record) => record.userId === userId));
  }

  findById(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
  ): Promise<CalendarSubscriptionRecord | null> {
    const record = this.db.tables.calendarSubscriptions.get(subscriptionId);
    return Promise.resolve(record?.userId === userId ? record : null);
  }

  create(record: CalendarSubscriptionRecord): Promise<CalendarSubscriptionRecord> {
    this.db.tables.calendarSubscriptions.set(record.id, record);
    return Promise.resolve(record);
  }

  async update(
    userId: UserId,
    subscriptionId: CalendarSubscriptionId,
    changes: CalendarSubscriptionChanges,
  ): Promise<CalendarSubscriptionRecord | null> {
    const record = await this.findById(userId, subscriptionId);
    if (record === null) {
      return null;
    }
    const updated = { ...record, ...changes };
    this.db.tables.calendarSubscriptions.set(subscriptionId, updated);
    return updated;
  }

  async delete(userId: UserId, subscriptionId: CalendarSubscriptionId): Promise<boolean> {
    if ((await this.findById(userId, subscriptionId)) === null) {
      return false;
    }
    return this.db.tables.calendarSubscriptions.delete(subscriptionId);
  }

  lockForRefresh(subscriptionId: CalendarSubscriptionId): Promise<boolean> {
    return Promise.resolve(this.db.tables.calendarSubscriptions.has(subscriptionId));
  }

  listDue(attemptedBefore: string, limit: number): Promise<CalendarSubscriptionRecord[]> {
    return Promise.resolve(
      this.all()
        .filter(
          (record) =>
            record.lastAttemptAt === null ||
            Date.parse(record.lastAttemptAt) < Date.parse(attemptedBefore),
        )
        .slice(0, limit),
    );
  }

  recordFetch(subscriptionId: CalendarSubscriptionId, record: CalendarFetchRecord): Promise<void> {
    const current = this.db.tables.calendarSubscriptions.get(subscriptionId);
    if (current === undefined) {
      return Promise.resolve();
    }
    this.db.tables.calendarSubscriptions.set(subscriptionId, {
      ...current,
      status: record.status,
      lastError: record.lastError,
      lastAttemptAt: record.attemptedAt,
      lastSyncedAt: record.syncedAt ?? current.lastSyncedAt,
      etag: record.etag === undefined ? current.etag : record.etag,
      lastModified: record.lastModified === undefined ? current.lastModified : record.lastModified,
      eventCount: record.eventCount ?? current.eventCount,
      updatedAt: record.attemptedAt,
    });
    return Promise.resolve();
  }

  private all(): CalendarSubscriptionRecord[] {
    return [...this.db.tables.calendarSubscriptions.values()];
  }
}
