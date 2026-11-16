import type { ParsedCalendarEvent, StoredCalendarEvent } from '../../model/calendar';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import { findAttendee, sameRevision, supersedes } from './event-precedence';
import { type CancelScope, cancelled } from './invite-cancellation';
import { type InviteContext, storedFrom } from './invite-context';
import { saveCurrent } from './invite-write';
import { atOrAfter, isMaster, recurrenceInstant } from './series-cut';
import type { SeriesRangeKeeper } from './series-range-keeper';

const scopeOf = (target: StoredCalendarEvent, event: ParsedCalendarEvent): CancelScope => {
  if (target.recurrenceId === event.recurrenceId) {
    return { link: true, flags: 'cut' };
  }
  return isMaster(target) ? { link: true, flags: 'keep' } : { link: false, flags: 'clear' };
};

const applied = (member: StoredCalendarEvent, event: ParsedCalendarEvent): boolean =>
  sameRevision(event, member) &&
  (member.recurrenceId !== event.recurrenceId || member.endsSeries === true);

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
    const atCut = series.find((member) => member.recurrenceId === event.recurrenceId);
    if (
      event.recurrenceId === null ||
      (master !== undefined && !supersedes(event, master)) ||
      (atCut !== undefined && !supersedes(event, atCut))
    ) {
      return false;
    }
    const from = recurrenceInstant(event.recurrenceId);
    const wholeSeries = master !== undefined && from <= Date.parse(master.startsAt);
    const targets = series.filter(
      (member) =>
        (isMaster(member) ? wholeSeries : atOrAfter(member, from)) &&
        supersedes(event, member) &&
        !applied(member, event),
    );
    for (const target of targets) {
      await saveCurrent(repositories, cancelled(target, context, event, scopeOf(target, event)));
    }
    const created =
      atCut === undefined && (await this.tombstone(repositories, context, event, master));
    await this.ranges.refresh(repositories, context, event.uid);
    return targets.length > 0 || created;
  }

  private async tombstone(
    repositories: Repositories,
    context: InviteContext,
    event: ParsedCalendarEvent,
    master: StoredCalendarEvent | undefined,
  ): Promise<boolean> {
    const mine = findAttendee(event.attendees, context.account.email);
    const summary = event.summary === '' ? (master?.summary ?? '') : event.summary;
    await saveCurrent(
      repositories,
      storedFrom(
        this.ids,
        context,
        { ...event, summary, status: 'cancelled', thisAndFuture: true, endsSeries: true },
        undefined,
        {
          myPartstat: mine?.partstat ?? null,
          myEmail: mine?.email ?? null,
        },
      ),
    );
    return true;
  }
}
