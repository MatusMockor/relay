import type { CalendarAttendee } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';
import type { Repositories } from '../../ports/repositories';
import { findAttendee, isOlderReply, withAttendeeStatus } from './event-precedence';
import type { InviteContext } from './invite-context';
import { saveCurrent } from './invite-write';

export interface AttendeeReply {
  readonly sequence: number;
  readonly dtstamp: string | null;
  readonly attendee: CalendarAttendee;
}

export const applyReply = async (
  repositories: Repositories,
  context: Pick<InviteContext, 'account' | 'now'>,
  stored: StoredCalendarEvent,
  reply: AttendeeReply,
): Promise<StoredCalendarEvent | null> => {
  const known = findAttendee(stored.attendees, reply.attendee.email);
  if (reply.sequence < stored.sequence || isOlderReply(known, reply.dtstamp)) {
    return null;
  }
  const mine = reply.attendee.email.toLowerCase() === context.account.email.toLowerCase();
  return saveCurrent(repositories, {
    ...stored,
    attendees: withAttendeeStatus(stored.attendees, {
      ...reply.attendee,
      repliedAt: reply.dtstamp,
    }),
    myPartstat: mine ? reply.attendee.partstat : stored.myPartstat,
    updatedAt: context.now,
  });
};
