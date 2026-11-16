import type { GoogleCalendar, GoogleCalendarId, UserId } from '@relay/shared/domain';
import type { UpdateGoogleCalendarBody } from '@relay/shared/api';
import { NotFoundError } from '../../errors';
import type { GoogleCalendarRecord } from '../../model/google-calendar';
import type { Clock } from '../../ports/clock';
import type { Logger } from '../../ports/logger';
import type { Repositories } from '../../ports/repositories';
import type { UnitOfWork } from '../../ports/unit-of-work';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { GoogleConnectionSync } from './google-connection-sync';
import { toCalendarView } from './google-views';

export interface GoogleCalendarPreferencesDeps {
  readonly repositories: Pick<Repositories, 'googleConnections'>;
  readonly unitOfWork: UnitOfWork;
  readonly sync: GoogleConnectionSync;
  readonly notifier: EngineEvents;
  readonly clock: Clock;
  readonly logger: Logger;
}

export class GoogleCalendarPreferencesService {
  constructor(private readonly deps: GoogleCalendarPreferencesDeps) {}

  async update(
    userId: UserId,
    calendarId: GoogleCalendarId,
    patch: UpdateGoogleCalendarBody,
  ): Promise<GoogleCalendar> {
    const updatedAt = this.deps.clock.now().toISOString();
    const updated = await this.deps.unitOfWork.run(async (repositories) => {
      const record = await repositories.googleCalendars.updatePreferences(userId, calendarId, {
        ...patch,
        updatedAt,
      });
      if (record !== null && patch.enabled === false) {
        await repositories.googleEvents.replaceCalendar(calendarId, []);
        await repositories.googleCalendars.recordSync(calendarId, {
          status: 'pending',
          lastError: null,
          syncedAt: null,
          syncToken: null,
        });
        return repositories.googleCalendars.findById(userId, calendarId);
      }
      return record;
    });
    if (updated === null) {
      throw new NotFoundError('Google calendar', calendarId);
    }
    if (patch.enabled === true) {
      this.syncInBackground(updated);
    }
    await this.deps.notifier.emit(userId, 'calendar.updated', {
      sourceKind: 'google',
      sourceId: calendarId,
    });
    return toCalendarView(updated);
  }

  private syncInBackground(calendar: GoogleCalendarRecord): void {
    void this.deps.repositories.googleConnections
      .findById(calendar.userId, calendar.connectionId)
      .then((connection) =>
        connection === null ? undefined : this.deps.sync.syncCalendar(connection, calendar),
      )
      .catch((error: unknown) => {
        this.deps.logger.warn('Google calendar sync after enabling failed', {
          calendarId: calendar.id,
          error: errorMessage(error),
        });
      });
  }
}
