import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import type { InviteContext } from './invite-context';

export const cancelled = (
  stored: StoredCalendarEvent,
  context: InviteContext,
  event: ParsedCalendarEvent,
): StoredCalendarEvent => ({
  ...stored,
  messageId: context.messageId,
  threadId: context.threadId,
  status: 'cancelled',
  method: 'CANCEL',
  sequence: event.sequence,
  dtstamp: event.dtstamp ?? stored.dtstamp,
  updatedAt: context.now,
});
