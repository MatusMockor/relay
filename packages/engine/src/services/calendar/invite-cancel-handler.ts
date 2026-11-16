import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import { findAttendee, supersedes } from './event-precedence';
import { cancelled } from './invite-cancellation';
import { type InviteContext, type InviteHandler, inviteSource, storedFrom } from './invite-context';
import { InviteRangeCancelHandler } from './invite-range-cancel-handler';
import { saveCurrent } from './invite-write';
import { involvesRange } from './series-cut';
import type { SeriesRangeKeeper } from './series-range-keeper';

const inScope = (member: StoredCalendarEvent, event: ParsedCalendarEvent): boolean =>
  event.recurrenceId === null || member.recurrenceId === event.recurrenceId;

export class InviteCancelHandler implements InviteHandler {
  private readonly range: InviteRangeCancelHandler;

  constructor(
    private readonly ids: IdGenerator,
    private readonly ranges: SeriesRangeKeeper,
  ) {
    this.range = new InviteRangeCancelHandler(ids, ranges);
  }

  async apply(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
  ): Promise<boolean> {
    const series = await repositories.calendarEvents.findSeries(inviteSource(context), event.uid);
    if (event.thisAndFuture === true) {
      return this.range.apply(repositories, context, event, series);
    }
    const targets = series.filter((member) => inScope(member, event) && supersedes(event, member));
    for (const target of targets) {
      await saveCurrent(repositories, cancelled(target, context, event));
    }
    if (targets.length > 0) {
      if (involvesRange(series, event)) {
        await this.ranges.refresh(repositories, context, event.uid);
      }
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
