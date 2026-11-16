import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import type { InviteContext } from './invite-context';

export interface CancelScope {
  readonly link: boolean;
  readonly range: boolean;
}

const INSTANCE: CancelScope = { link: true, range: false };

export const cancelled = (
  stored: StoredCalendarEvent,
  context: InviteContext,
  event: ParsedCalendarEvent,
  scope: CancelScope = INSTANCE,
): StoredCalendarEvent => {
  const { thisAndFuture: _range, ...rest } = stored;
  const keepsCut = stored.status === 'cancelled' && stored.thisAndFuture === true;
  return {
    ...rest,
    ...(scope.range || keepsCut ? { thisAndFuture: true } : {}),
    ...(scope.link ? { messageId: context.messageId, threadId: context.threadId } : {}),
    status: 'cancelled',
    method: 'CANCEL',
    sequence: event.sequence,
    dtstamp: event.dtstamp ?? stored.dtstamp,
    updatedAt: context.now,
  };
};
