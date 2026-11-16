import type { CalendarSubscriptionId, UserId } from '@relay/shared/domain';
import type {
  ParsedCalendar,
  ParsedCalendarEvent,
  StoredCalendarEvent,
} from '../../model/calendar';
import type { IdGenerator } from '../../ports/id-generator';
import { supersedes } from './event-precedence';
import { calendarRecurrenceKey } from './recurrence-slot';

export const MAX_FEED_EVENTS = 20_000;

export interface FeedOwner {
  readonly userId: UserId;
  readonly subscriptionId: CalendarSubscriptionId;
  readonly now: string;
}

const toStored = (
  ids: IdGenerator,
  owner: FeedOwner,
  { timed: _timed, ...event }: ParsedCalendarEvent,
): StoredCalendarEvent => ({
  ...event,
  id: ids.generate('calendarEvent'),
  userId: owner.userId,
  source: { kind: 'subscription', subscriptionId: owner.subscriptionId },
  method: 'PUBLISH',
  myPartstat: null,
  myEmail: null,
  messageId: null,
  threadId: null,
  createdAt: owner.now,
  updatedAt: owner.now,
  revision: 0,
});

export const feedEvents = (
  ids: IdGenerator,
  owner: FeedOwner,
  calendar: ParsedCalendar,
): StoredCalendarEvent[] => {
  const latest = new Map<string, StoredCalendarEvent>();
  for (const event of calendar.events.filter((entry) => entry.timed).slice(0, MAX_FEED_EVENTS)) {
    const key = `${event.uid}\u0000${calendarRecurrenceKey(event)}`;
    const known = latest.get(key);
    if (supersedes(event, known)) {
      latest.set(key, toStored(ids, owner, event));
    }
  }
  return [...latest.values()];
};
