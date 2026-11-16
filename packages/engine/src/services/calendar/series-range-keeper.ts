import type { CalendarExpander } from '../../ports/calendar-adapters';
import type { Repositories } from '../../ports/repositories';
import { type InviteContext, inviteSource } from './invite-context';
import { saveCurrent } from './invite-write';
import { isMaster } from './series-cut';

export class SeriesRangeKeeper {
  constructor(private readonly expander: CalendarExpander) {}

  async refresh(repositories: Repositories, context: InviteContext, uid: string): Promise<void> {
    const series = await repositories.calendarEvents.findSeries(inviteSource(context), uid);
    const master = series.find(isMaster);
    if (master === undefined || !master.recurring) {
      return;
    }
    const overrides = series.filter((member) => !isMaster(member));
    const rangeEndsAt = this.expander.seriesRangeEnd(master, overrides);
    if (rangeEndsAt === master.rangeEndsAt) {
      return;
    }
    await saveCurrent(repositories, { ...master, rangeEndsAt, updatedAt: context.now });
  }
}
