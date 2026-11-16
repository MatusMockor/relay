import type { StoredCalendarEvent } from '../../model/calendar';
import type { CalendarParser } from '../../ports/calendar-adapters';
import type { Repositories } from '../../ports/repositories';
import { instanceTiming } from './cancel-timing';
import { type InviteContext, inviteSource } from './invite-context';
import { saveCurrent } from './invite-write';
import { isMaster } from './series-cut';

const untimedCancel =
  (parser: CalendarParser) =>
  (row: StoredCalendarEvent): boolean =>
    row.recurrenceId !== null &&
    row.thisAndFuture !== true &&
    row.status === 'cancelled' &&
    row.method === 'CANCEL' &&
    row.startsAt === row.endsAt &&
    parser.parse(row.ics)?.events.some((event) => event.timed) !== true;

export const retimeUntimedCancels = async (
  repositories: Repositories,
  context: InviteContext,
  master: StoredCalendarEvent,
  parser: CalendarParser,
): Promise<void> => {
  if (!isMaster(master) || master.startsAt === master.endsAt) {
    return;
  }
  const series = await repositories.calendarEvents.findSeries(inviteSource(context), master.uid);
  for (const row of series.filter(untimedCancel(parser))) {
    const timing = instanceTiming(row.recurrenceId ?? '', master);
    await saveCurrent(repositories, { ...row, ...timing, updatedAt: context.now });
  }
};
