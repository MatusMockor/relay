import type { UserId } from '@relay/shared/domain';
import type {
  GoogleCalendarRecord,
  GoogleEventRecord,
  RemoteGoogleEvent,
} from '../../model/google-calendar';
import type { Clock } from '../../ports/clock';
import type { IdGenerator } from '../../ports/id-generator';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { buildGoogleRecord } from './google-event-records';

export interface GoogleEventStoreDeps {
  readonly unitOfWork: UnitOfWork;
  readonly notifier: EngineEvents;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

export class GoogleEventStore {
  constructor(private readonly deps: GoogleEventStoreDeps) {}

  async store(
    calendar: GoogleCalendarRecord,
    event: RemoteGoogleEvent,
  ): Promise<GoogleEventRecord | null> {
    const now = this.deps.clock.now().toISOString();
    const record = await this.deps.unitOfWork.run(async (repositories) => {
      const current = await repositories.googleCalendars.lockForSync(calendar.id);
      if (current === null || !current.enabled) {
        return null;
      }
      const known = (remoteId: string) =>
        repositories.googleEvents.findByRemoteId(calendar.id, remoteId);
      const context = { userId: calendar.userId, calendar: current, now, known };
      const built = await buildGoogleRecord(this.deps.ids, context, event);
      if (built !== null) {
        await repositories.googleEvents.save([built]);
      }
      return built;
    });
    await this.changed(calendar.userId, calendar);
    return record;
  }

  async forget(calendar: GoogleCalendarRecord, record: GoogleEventRecord): Promise<void> {
    if (record.event.recurrenceId === null) {
      await this.remove(calendar, record.event.uid);
      return;
    }
    const updatedAt = this.deps.clock.now().toISOString();
    await this.deps.unitOfWork.run(async (repositories) => {
      const current = await repositories.googleCalendars.lockForSync(calendar.id);
      if (current === null || !current.enabled) {
        return;
      }
      await repositories.googleEvents.save([
        { ...record, event: { ...record.event, status: 'cancelled', updatedAt } },
      ]);
    });
    await this.changed(calendar.userId, calendar);
  }

  async remove(calendar: GoogleCalendarRecord, uid: string): Promise<void> {
    await this.deps.unitOfWork.run((repositories) =>
      repositories.googleEvents.removeSeries(calendar.id, uid),
    );
    await this.changed(calendar.userId, calendar);
  }

  private changed(userId: UserId, calendar: GoogleCalendarRecord): Promise<void> {
    return this.deps.notifier.emit(userId, 'calendar.updated', {
      sourceKind: 'google',
      sourceId: calendar.id,
    });
  }
}
