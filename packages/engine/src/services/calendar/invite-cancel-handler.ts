import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import { cancelTiming } from './cancel-timing';
import { findAttendee, sameRevision, supersedes } from './event-precedence';
import { cancelled } from './invite-cancellation';
import { type InviteContext, type InviteHandler, inviteSource, storedFrom } from './invite-context';
import { InviteRangeCancelHandler } from './invite-range-cancel-handler';
import { saveCurrent } from './invite-write';
import { sameSlot } from './recurrence-slot';
import { compareRevisions } from './revision-order';
import { involvesRange, isMaster } from './series-cut';
import type { SeriesRangeKeeper } from './series-range-keeper';

type Series = readonly StoredCalendarEvent[];

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
    const slot = series.find((member) => sameSlot(member, event));
    const changed =
      slot === undefined
        ? await this.storeNew(repositories, context, event, series)
        : await this.cancelSlot(repositories, context, event, slot);
    if (changed && involvesRange(series, event)) {
      await this.ranges.refresh(repositories, context, event.uid);
    }
    return changed;
  }

  private async cancelSlot(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
    slot: StoredCalendarEvent,
  ): Promise<boolean> {
    if (!supersedes(event, slot) || sameRevision(event, slot)) {
      return false;
    }
    await saveCurrent(repositories, cancelled(slot, context, event));
    return true;
  }

  private async storeNew(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
    series: Series,
  ): Promise<boolean> {
    const master = series.find(isMaster);
    if (master !== undefined && compareRevisions(event, master) < 0) {
      return false;
    }
    const timing = cancelTiming(event, series);
    if (timing === null) {
      return false;
    }
    const mine = findAttendee(event.attendees, context.account.email);
    await saveCurrent(
      repositories,
      storedFrom(this.ids, context, { ...event, ...timing, status: 'cancelled' }, undefined, {
        myPartstat: mine?.partstat ?? null,
        myEmail: mine?.email ?? null,
      }),
    );
    return true;
  }
}
