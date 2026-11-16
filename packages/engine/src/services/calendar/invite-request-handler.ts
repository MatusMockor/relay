import type { ParsedCalendarEvent } from '../../model/calendar';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import { withStoredAnswers } from './attendee-answers';
import { findAttendee, resolveMyPartstat, sameRevision, supersedes } from './event-precedence';
import { type InviteContext, type InviteHandler, inviteSource, storedFrom } from './invite-context';
import { saveCurrent } from './invite-write';
import type { ParkedReplies } from './parked-replies';

export class InviteRequestHandler implements InviteHandler {
  constructor(
    private readonly ids: IdGenerator,
    private readonly parked: ParkedReplies,
  ) {}

  async apply(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
  ): Promise<boolean> {
    const series = await repositories.calendarEvents.findSeries(inviteSource(context), event.uid);
    const stored = series.find((member) => member.recurrenceId === event.recurrenceId);
    if (stored !== undefined && sameRevision(event, stored)) {
      await this.parked.release(repositories, context, stored);
      return false;
    }
    if (!event.timed || !supersedes(event, stored)) {
      return false;
    }
    const merged = { ...event, attendees: withStoredAnswers(event, stored) };
    const mine = findAttendee(merged.attendees, context.account.email);
    const saved = await saveCurrent(
      repositories,
      storedFrom(this.ids, context, merged, stored, {
        myPartstat: resolveMyPartstat(mine, merged, stored),
        myEmail: mine?.email ?? stored?.myEmail ?? null,
      }),
    );
    await this.parked.release(repositories, context, saved);
    return true;
  }
}
