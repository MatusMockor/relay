import type { ParsedCalendarEvent } from '../../model/calendar';
import type { Repositories } from '../../ports/repositories';
import { type InviteContext, type InviteHandler, inviteSource } from './invite-context';
import type { ParkedReplies } from './parked-replies';
import { applyReply } from './reply-application';

export class InviteReplyHandler implements InviteHandler {
  constructor(private readonly parked: ParkedReplies) {}

  async apply(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
  ): Promise<boolean> {
    const [replier] = event.attendees;
    if (replier === undefined) {
      return false;
    }
    const series = await repositories.calendarEvents.findSeries(inviteSource(context), event.uid);
    const stored = series.find((member) => member.recurrenceId === event.recurrenceId);
    if (stored === undefined) {
      await this.parked.park(repositories.pendingWork, context, event, replier);
      return false;
    }
    const reply = { sequence: event.sequence, dtstamp: event.dtstamp, attendee: replier };
    return (await applyReply(repositories, context, stored, reply)) !== null;
  }
}
