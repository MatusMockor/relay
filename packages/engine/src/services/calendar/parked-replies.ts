import type { CalendarAttendee } from '@relay/shared/domain';
import type { CalendarEventData, StoredCalendarEvent } from '../../model/calendar';
import type { CalendarReplyWork } from '../../model/pending-work';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { Repositories } from '../../ports/repositories';
import type { InviteContext } from './invite-context';
import { calendarRecurrenceKey, isRangeRecord, sameSlot } from './recurrence-slot';
import { applyReply } from './reply-application';

const PARKED_REPLY_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const stampOf = (value: string | null): number => (value === null ? 0 : Date.parse(value));

const isNewer = (
  stored: CalendarReplyWork,
  incoming: Pick<CalendarEventData, 'sequence' | 'dtstamp'>,
) =>
  stored.sequence > incoming.sequence ||
  (stored.sequence === incoming.sequence && stampOf(stored.dtstamp) > stampOf(incoming.dtstamp));

const sameInstance = (work: CalendarReplyWork, event: StoredCalendarEvent): boolean =>
  work.uid === event.uid && sameSlot(work, event);

export class ParkedReplies {
  async park(
    work: PendingWorkRepository,
    context: InviteContext,
    event: CalendarEventData,
    attendee: CalendarAttendee,
  ): Promise<void> {
    const ref = JSON.stringify([
      event.uid,
      calendarRecurrenceKey(event) || null,
      attendee.email.toLowerCase(),
    ]);
    const key = { accountId: context.account.id, kind: 'calendar-reply' as const, ref };
    const stored = await work.find(key);
    if (stored !== null && isNewer(stored.payload, event)) {
      return;
    }
    await work.put({
      ...key,
      payload: {
        uid: event.uid,
        recurrenceId: event.recurrenceId,
        ...(isRangeRecord(event) ? { thisAndFuture: true } : {}),
        sequence: event.sequence,
        dtstamp: event.dtstamp,
        attendee,
        messageId: context.messageId,
        parkedAt: context.now,
      },
      createdAt: context.now,
    });
  }

  async release(
    repositories: Repositories,
    context: InviteContext,
    event: StoredCalendarEvent,
  ): Promise<void> {
    const parked = await repositories.pendingWork.list(context.account.id, 'calendar-reply');
    const cutoff = Date.parse(context.now) - PARKED_REPLY_TTL_MS;
    const expired = parked.filter((item) => Date.parse(item.payload.parkedAt) < cutoff);
    const matching = parked.filter(
      (item) => !expired.includes(item) && sameInstance(item.payload, event),
    );
    let current = event;
    for (const item of matching) {
      current = (await applyReply(repositories, context, current, item.payload)) ?? current;
    }
    await repositories.pendingWork.remove([...expired, ...matching]);
  }
}
