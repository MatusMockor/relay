import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import { findAttendee, supersedes } from './event-precedence';
import { type InviteContext, type InviteHandler, inviteSource, storedFrom } from './invite-context';
import { saveCurrent } from './invite-write';

const cancelled = (
  stored: StoredCalendarEvent,
  context: InviteContext,
  event: ParsedCalendarEvent,
): StoredCalendarEvent => ({
  ...stored,
  status: 'cancelled',
  method: 'CANCEL',
  sequence: event.sequence,
  dtstamp: event.dtstamp ?? stored.dtstamp,
  messageId: context.messageId,
  threadId: context.threadId,
  updatedAt: context.now,
});

const inScope = (member: StoredCalendarEvent, event: ParsedCalendarEvent): boolean =>
  event.recurrenceId === null || member.recurrenceId === event.recurrenceId;

export class InviteCancelHandler implements InviteHandler {
  constructor(private readonly ids: IdGenerator) {}

  async apply(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
  ): Promise<boolean> {
    const series = await repositories.calendarEvents.findSeries(inviteSource(context), event.uid);
    const targets = series.filter((member) => inScope(member, event) && supersedes(event, member));
    for (const target of targets) {
      await saveCurrent(repositories, cancelled(target, context, event));
    }
    if (targets.length > 0) {
      return true;
    }
    if (!event.timed || series.some((member) => inScope(member, event))) {
      return false;
    }
    const master = series.find((member) => member.recurrenceId === null);
    if (master !== undefined && event.sequence < master.sequence) {
      return false;
    }
    const mine = findAttendee(event.attendees, context.account.email);
    await saveCurrent(
      repositories,
      storedFrom(this.ids, context, { ...event, status: 'cancelled' }, undefined, {
        myPartstat: mine?.partstat ?? null,
        myEmail: mine?.email ?? null,
      }),
    );
    return true;
  }
}
