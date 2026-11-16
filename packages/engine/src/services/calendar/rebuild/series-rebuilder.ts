import type { MailAccount, UserId } from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../../model/calendar';
import type { CalendarRebuildPartWork } from '../../../model/pending-work';
import type { Clock } from '../../../ports/clock';
import type { Repositories } from '../../../ports/repositories';
import type { InviteIngestor } from '../invite-ingestor';
import { calendarRecurrenceKey } from '../recurrence-slot';
import { saveCurrent } from '../invite-write';
import { withKeptResponses } from './kept-responses';
import { ScratchCalendarEvents } from './scratch-calendar-events';

const VOLATILE = new Set(['id', 'revision', 'createdAt', 'updatedAt']);

const contentOf = (row: StoredCalendarEvent): string =>
  JSON.stringify(
    Object.entries(row)
      .filter(([key, value]) => !VOLATILE.has(key) && value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

export class SeriesRebuilder {
  constructor(
    private readonly ingestor: InviteIngestor,
    private readonly clock: Clock,
  ) {}

  async rebuild(
    repositories: Repositories,
    userId: UserId,
    account: MailAccount,
    uid: string,
    arrivals: readonly CalendarRebuildPartWork[],
  ): Promise<boolean> {
    const source = { kind: 'invite', accountId: account.id } as const;
    const scratch = new ScratchCalendarEvents(repositories.calendarEvents, source, uid);
    const replay = { ...repositories, calendarEvents: scratch };
    for (const arrival of [...arrivals, ...arrivals]) {
      await this.ingestor.apply(replay, userId, { ...arrival, account, publish: true }, uid);
    }
    const old = new Map(
      (await repositories.calendarEvents.findSeries(source, uid)).map((row) => [
        calendarRecurrenceKey(row),
        row,
      ]),
    );
    let changed = false;
    for (const fresh of scratch.series()) {
      changed =
        (await this.write(repositories, fresh, old.get(calendarRecurrenceKey(fresh)))) || changed;
    }
    return changed;
  }

  private async write(
    repositories: Repositories,
    fresh: StoredCalendarEvent,
    old: StoredCalendarEvent | undefined,
  ): Promise<boolean> {
    const merged = withKeptResponses(fresh, old);
    if (old === undefined) {
      await saveCurrent(repositories, { ...merged, revision: 0 });
      return true;
    }
    const kept = { ...merged, id: old.id, createdAt: old.createdAt, revision: old.revision };
    if (contentOf(kept) === contentOf(old)) {
      return false;
    }
    await saveCurrent(repositories, { ...kept, updatedAt: this.clock.now().toISOString() });
    return true;
  }
}
