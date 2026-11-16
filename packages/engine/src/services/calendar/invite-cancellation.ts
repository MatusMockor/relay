import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import { rangeRevisionOf } from './event-precedence';
import type { InviteContext } from './invite-context';
import { isRangeRequest } from './series-range-rows';

export type RangeFlags = 'keep' | 'cut' | 'clear';

export interface CancelScope {
  readonly link: boolean;
  readonly flags: RangeFlags;
}

const INSTANCE: CancelScope = { link: true, flags: 'keep' };

const CUT_FLAGS = { thisAndFuture: true, endsSeries: true } as const;

const withFlags = (stored: StoredCalendarEvent, flags: RangeFlags): StoredCalendarEvent => {
  const { thisAndFuture: _range, endsSeries: _ends, rangeRevision: _revision, ...rest } = stored;
  if (flags === 'keep') {
    return isRangeRequest(stored) ? { ...stored, rangeRevision: rangeRevisionOf(stored) } : stored;
  }
  return flags === 'cut' ? { ...rest, ...CUT_FLAGS } : rest;
};

export const cancelled = (
  stored: StoredCalendarEvent,
  context: InviteContext,
  event: ParsedCalendarEvent,
  scope: CancelScope = INSTANCE,
): StoredCalendarEvent => ({
  ...withFlags(stored, scope.flags),
  ...(scope.link ? { messageId: context.messageId, threadId: context.threadId } : {}),
  status: 'cancelled',
  method: 'CANCEL',
  sequence: event.sequence,
  dtstamp: event.dtstamp ?? stored.dtstamp,
  updatedAt: context.now,
});
