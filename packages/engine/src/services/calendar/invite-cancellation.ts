import type {
  CalendarRevision,
  ParsedCalendarEvent,
  StoredCalendarEvent,
} from '../../model/calendar';
import type { InviteContext } from './invite-context';
import { sameSlot } from './recurrence-slot';

const stampOf = (value: string | null): number => (value === null ? 0 : Date.parse(value));

const laterStamp = (a: string | null, b: string | null): string | null =>
  stampOf(b) > stampOf(a) ? b : a;

const revisionAfter = (
  stored: StoredCalendarEvent,
  event: ParsedCalendarEvent,
): CalendarRevision => {
  if (sameSlot(stored, event)) {
    return { sequence: event.sequence, dtstamp: event.dtstamp ?? stored.dtstamp };
  }
  return { sequence: stored.sequence, dtstamp: laterStamp(stored.dtstamp, event.dtstamp) };
};

export const cancels = (stored: StoredCalendarEvent, event: ParsedCalendarEvent): boolean => {
  const next = revisionAfter(stored, event);
  return (
    stored.status !== 'cancelled' ||
    stored.sequence !== next.sequence ||
    stampOf(stored.dtstamp) !== stampOf(next.dtstamp)
  );
};

export const cancelled = (
  stored: StoredCalendarEvent,
  context: InviteContext,
  event: ParsedCalendarEvent,
): StoredCalendarEvent => ({
  ...stored,
  ...revisionAfter(stored, event),
  messageId: context.messageId,
  threadId: context.threadId,
  status: 'cancelled',
  method: 'CANCEL',
  updatedAt: context.now,
});
