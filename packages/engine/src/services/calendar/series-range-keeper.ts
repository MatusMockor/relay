import type { StoredCalendarEvent } from '../../model/calendar';
import type { CalendarExpander } from '../../ports/calendar-adapters';
import type { Repositories } from '../../ports/repositories';
import { type InviteContext, inviteSource } from './invite-context';
import { saveCurrent } from './invite-write';
import { isMaster } from './series-cut';
import { isRangeRequest, rangeRowEnd } from './series-range-rows';

export class SeriesRangeKeeper {
  constructor(private readonly expander: CalendarExpander) {}

  async refresh(repositories: Repositories, context: InviteContext, uid: string): Promise<void> {
    const series = await repositories.calendarEvents.findSeries(inviteSource(context), uid);
    const master = series.find(isMaster);
    if (master === undefined || !master.recurring) {
      return;
    }
    const overrides = series.filter((member) => !isMaster(member));
    const seriesEnd = this.expander.seriesRangeEnd(master, overrides);
    await this.store(repositories, context, master, seriesEnd);
    for (const row of overrides.filter(isRangeRequest)) {
      await this.store(repositories, context, row, rangeRowEnd(row, seriesEnd));
    }
  }

  private async store(
    repositories: Repositories,
    context: InviteContext,
    row: StoredCalendarEvent,
    rangeEndsAt: string | null,
  ): Promise<void> {
    if (rangeEndsAt === row.rangeEndsAt) {
      return;
    }
    await saveCurrent(repositories, { ...row, rangeEndsAt, updatedAt: context.now });
  }
}
