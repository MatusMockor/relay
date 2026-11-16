import type {
  CalendarAttendee,
  CalendarEventId,
  CalendarPartStat,
  CalendarSubscriptionId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type { CalendarRange, CalendarSource, StoredCalendarEvent } from '../model/calendar';

export interface CalendarResponseChange {
  readonly myPartstat: CalendarPartStat;
  readonly attendees: readonly CalendarAttendee[];
  readonly updatedAt: string;
  readonly expectedRevision: number;
}

export interface CalendarEventRepository {
  findById(userId: UserId, eventId: CalendarEventId): Promise<StoredCalendarEvent | null>;
  findSeries(source: CalendarSource, uid: string): Promise<StoredCalendarEvent[]>;
  listForRange(userId: UserId, range: CalendarRange): Promise<StoredCalendarEvent[]>;
  listByThread(userId: UserId, threadId: ThreadId): Promise<StoredCalendarEvent[]>;
  upsert(event: StoredCalendarEvent): Promise<StoredCalendarEvent>;
  saveIfCurrent(event: StoredCalendarEvent): Promise<StoredCalendarEvent | null>;
  updateResponse(
    eventId: CalendarEventId,
    change: CalendarResponseChange,
  ): Promise<StoredCalendarEvent | null>;
  replaceSubscriptionEvents(
    subscriptionId: CalendarSubscriptionId,
    events: readonly StoredCalendarEvent[],
  ): Promise<void>;
}
