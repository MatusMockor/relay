import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import { withStoredAnswers } from './attendee-answers';
import {
  compareRevisions,
  findAttendee,
  resolveMyPartstat,
  sameRevision,
  supersedes,
} from './event-precedence';
import { type InviteContext, type InviteHandler, inviteSource, storedFrom } from './invite-context';
import { saveCurrent } from './invite-write';
import type { ParkedReplies } from './parked-replies';
import { sameSlot } from './recurrence-slot';
import { cutOffByRange, involvesRange } from './series-cut';
import type { SeriesRangeKeeper } from './series-range-keeper';

const keepsCut = (event: ParsedCalendarEvent, stored: StoredCalendarEvent | undefined): boolean =>
  stored?.endsSeries === true && event.endsSeries !== true && compareRevisions(event, stored) <= 0;

export class InviteRequestHandler implements InviteHandler {
  constructor(
    private readonly ids: IdGenerator,
    private readonly parked: ParkedReplies,
    private readonly ranges: SeriesRangeKeeper,
  ) {}

  async apply(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
  ): Promise<boolean> {
    const series = await repositories.calendarEvents.findSeries(inviteSource(context), event.uid);
    const stored = series.find((member) => sameSlot(member, event));
    if (stored !== undefined && sameRevision(event, stored)) {
      await this.parked.release(repositories, context, stored);
      await this.refreshRange(repositories, context, series, event);
      return false;
    }
    if (
      !event.timed ||
      !supersedes(event, stored) ||
      keepsCut(event, stored) ||
      cutOffByRange(series, event)
    ) {
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
    await this.refreshRange(repositories, context, series, event);
    return true;
  }

  private async refreshRange(
    repositories: Repositories,
    context: InviteContext,
    series: readonly StoredCalendarEvent[],
    event: ParsedCalendarEvent,
  ): Promise<void> {
    if (!involvesRange(series, event)) {
      return;
    }
    await this.ranges.refresh(repositories, context, event.uid);
  }
}
