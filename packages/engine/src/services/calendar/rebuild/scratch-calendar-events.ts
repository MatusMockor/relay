import type {
  CalendarEventId,
  CalendarSubscriptionId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type { CalendarRange, CalendarSource, StoredCalendarEvent } from '../../../model/calendar';
import type {
  CalendarEventRepository,
  CalendarResponseChange,
} from '../../../ports/calendar-event-repository';
import { calendarRecurrenceKey } from '../recurrence-slot';

export class ScratchCalendarEvents implements CalendarEventRepository {
  private readonly rows = new Map<string, StoredCalendarEvent>();

  constructor(
    private readonly real: CalendarEventRepository,
    private readonly source: CalendarSource,
    private readonly uid: string,
  ) {}

  series(): StoredCalendarEvent[] {
    return [...this.rows.values()];
  }

  findById(userId: UserId, eventId: CalendarEventId): Promise<StoredCalendarEvent | null> {
    const row = this.series().find((entry) => entry.id === eventId);
    return row === undefined ? this.real.findById(userId, eventId) : Promise.resolve(row);
  }

  findSeries(source: CalendarSource, uid: string): Promise<StoredCalendarEvent[]> {
    if (!this.covers(source, uid)) {
      return this.real.findSeries(source, uid);
    }
    return Promise.resolve(this.series());
  }

  listForRange(userId: UserId, range: CalendarRange): Promise<StoredCalendarEvent[]> {
    return this.real.listForRange(userId, range);
  }

  listByThread(userId: UserId, threadId: ThreadId): Promise<StoredCalendarEvent[]> {
    return this.real.listByThread(userId, threadId);
  }

  upsert(event: StoredCalendarEvent): Promise<StoredCalendarEvent> {
    const known = this.rows.get(calendarRecurrenceKey(event));
    return Promise.resolve(this.store({ ...event, id: known?.id ?? event.id }, known));
  }

  saveIfCurrent(event: StoredCalendarEvent): Promise<StoredCalendarEvent | null> {
    const known = this.rows.get(calendarRecurrenceKey(event));
    if ((known?.revision ?? 0) !== event.revision) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.store(event, known));
  }

  updateResponse(
    eventId: CalendarEventId,
    change: CalendarResponseChange,
  ): Promise<StoredCalendarEvent | null> {
    return this.real.updateResponse(eventId, change);
  }

  replaceSubscriptionEvents(
    subscriptionId: CalendarSubscriptionId,
    events: readonly StoredCalendarEvent[],
  ): Promise<void> {
    return this.real.replaceSubscriptionEvents(subscriptionId, events);
  }

  private covers(source: CalendarSource, uid: string): boolean {
    return uid === this.uid && JSON.stringify(source) === JSON.stringify(this.source);
  }

  private store(event: StoredCalendarEvent, known: StoredCalendarEvent | undefined) {
    const stored = { ...event, revision: (known?.revision ?? 0) + 1 };
    this.rows.set(calendarRecurrenceKey(stored), stored);
    return stored;
  }
}
