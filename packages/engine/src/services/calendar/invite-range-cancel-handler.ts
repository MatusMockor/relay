import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import { findAttendee, sameRevision, supersedes } from './event-precedence';
import { cancelled, cancels } from './invite-cancellation';
import { type InviteContext, storedFrom } from './invite-context';
import { saveCurrent } from './invite-write';
import { cutRecordAt, rangeRecordAt } from './recurrence-slot';
import { isMaster, recurrenceInstant } from './series-cut';
import type { SeriesRangeKeeper } from './series-range-keeper';

const titleOf = (...candidates: (StoredCalendarEvent | ParsedCalendarEvent | undefined)[]) =>
  candidates.find((candidate) => candidate !== undefined && candidate.summary !== '')?.summary ??
  '';

export class InviteRangeCancelHandler {
  constructor(
    private readonly ids: IdGenerator,
    private readonly ranges: SeriesRangeKeeper,
  ) {}

  async apply(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
    series: readonly StoredCalendarEvent[],
  ): Promise<boolean> {
    const master = series.find(isMaster);
    if (event.recurrenceId === null || (master !== undefined && !supersedes(event, master))) {
      return false;
    }
    const slot = cutRecordAt(series, event.recurrenceId);
    const range = rangeRecordAt(series, event.recurrenceId);
    if (!supersedes(event, slot) || !supersedes(event, range)) {
      return false;
    }
    const summary = titleOf(event, slot, range, master);
    const cut = await this.storeCut(repositories, context, { ...event, summary }, slot);
    const whole = await this.cancelWholeSeries(repositories, context, event, master);
    await this.ranges.refresh(repositories, context, event.uid);
    return cut || whole;
  }

  private async storeCut(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
    slot: StoredCalendarEvent | undefined,
  ): Promise<boolean> {
    if (slot !== undefined && sameRevision(event, slot)) {
      return false;
    }
    const mine = findAttendee(event.attendees, context.account.email);
    const cut = {
      ...event,
      status: 'cancelled' as const,
      thisAndFuture: true,
      endsSeries: true,
    };
    await saveCurrent(
      repositories,
      storedFrom(this.ids, context, cut, slot, {
        myPartstat: mine?.partstat ?? slot?.myPartstat ?? null,
        myEmail: mine?.email ?? slot?.myEmail ?? null,
      }),
    );
    return true;
  }

  private async cancelWholeSeries(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
    master: StoredCalendarEvent | undefined,
  ): Promise<boolean> {
    if (
      master === undefined ||
      recurrenceInstant(event.recurrenceId ?? '') > Date.parse(master.startsAt) ||
      !cancels(master, event)
    ) {
      return false;
    }
    await saveCurrent(repositories, cancelled(master, context, event));
    return true;
  }
}
