import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import { rangeRevisionOf } from './event-precedence';
import type { InviteContext } from './invite-context';
import { isRangeRequest } from './series-range-rows';

export type RangeFlags = 'keep' | 'cut';

const withFlags = (stored: StoredCalendarEvent, flags: RangeFlags): StoredCalendarEvent => {
  if (flags === 'keep') {
    return isRangeRequest(stored) ? { ...stored, rangeRevision: rangeRevisionOf(stored) } : stored;
  }
  const { rangeRevision: _revision, ...rest } = stored;
  return { ...rest, thisAndFuture: true, endsSeries: true };
};

export const cancelled = (
  stored: StoredCalendarEvent,
  context: InviteContext,
  event: ParsedCalendarEvent,
  flags: RangeFlags = 'keep',
): StoredCalendarEvent => ({
  ...withFlags(stored, flags),
  messageId: context.messageId,
  threadId: context.threadId,
  status: 'cancelled',
  method: 'CANCEL',
  sequence: event.sequence,
  dtstamp: event.dtstamp ?? stored.dtstamp,
  updatedAt: context.now,
});
