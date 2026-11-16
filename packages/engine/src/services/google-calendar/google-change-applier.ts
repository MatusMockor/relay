import type {
  GoogleCalendarRecord,
  GoogleEventChange,
  GoogleEventRecord,
} from '../../model/google-calendar';
import type { IdGenerator } from '../../ports/id-generator';
import type { Repositories } from '../../ports/repositories';
import { ProviderError } from '../../errors';
import { buildGoogleRecord } from './google-event-records';
import { GOOGLE_MESSAGES } from './google-messages';

export const MAX_GOOGLE_EVENTS = 20_000;

const isInstance = (change: GoogleEventChange): boolean =>
  change.kind === 'event' && change.event.recurringRemoteId !== null;

const mastersFirst = (changes: readonly GoogleEventChange[]): GoogleEventChange[] => [
  ...changes.filter((change) => !isInstance(change)),
  ...changes.filter(isInstance),
];

const recordKey = (record: GoogleEventRecord): string =>
  `${record.event.uid}\u0000${record.event.recurrenceId ?? ''}`;

export class GoogleChangeApplier {
  constructor(
    private readonly ids: IdGenerator,
    private readonly maxEvents = MAX_GOOGLE_EVENTS,
  ) {}

  async applyIncremental(
    repositories: Repositories,
    calendar: GoogleCalendarRecord,
    changes: readonly GoogleEventChange[],
    now: string,
  ): Promise<void> {
    const events = repositories.googleEvents;
    const known = (remoteId: string) => events.findByRemoteId(calendar.id, remoteId);
    const context = { userId: calendar.userId, calendar, now, known };
    for (const change of mastersFirst(changes)) {
      if (change.kind === 'removed') {
        const uid = (await known(change.remoteId))?.event.uid ?? change.uid;
        if (uid !== null) {
          await events.removeSeries(calendar.id, uid);
        }
        continue;
      }
      const record = await buildGoogleRecord(this.ids, context, change.event);
      if (record !== null) {
        await events.save([record]);
      }
    }
  }

  async replaceAll(
    repositories: Repositories,
    calendar: GoogleCalendarRecord,
    changes: readonly GoogleEventChange[],
    now: string,
  ): Promise<number> {
    const events = repositories.googleEvents;
    const batch = new Map<string, GoogleEventRecord>();
    const known = async (remoteId: string) =>
      batch.get(remoteId) ?? (await events.findByRemoteId(calendar.id, remoteId));
    const context = { userId: calendar.userId, calendar, now, known };
    const remote = mastersFirst(changes).flatMap((change) =>
      change.kind === 'event' ? [change.event] : [],
    );
    for (const event of remote) {
      const record = await buildGoogleRecord(this.ids, context, event);
      if (record !== null) {
        batch.set(record.remoteId, record);
      }
    }
    const unique = new Map([...batch.values()].map((record) => [recordKey(record), record]));
    const records = [...unique.values()];
    if (records.length > this.maxEvents) {
      throw new ProviderError(GOOGLE_MESSAGES.tooManyEvents);
    }
    await events.replaceCalendar(calendar.id, records);
    return records.length;
  }
}
