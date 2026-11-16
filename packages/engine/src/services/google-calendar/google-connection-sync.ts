import { ReauthorizationRequiredError } from '../../errors';
import type { GoogleCalendarRecord, GoogleConnectionRecord } from '../../model/google-calendar';
import type { Clock } from '../../ports/clock';
import type {
  GoogleCalendarRepository,
  GoogleConnectionRepository,
} from '../../ports/google-calendar-repositories';
import type { Logger } from '../../ports/logger';
import type { EngineEvents } from '../shared/engine-events';
import { KeyedSerializer } from '../shared/keyed-serializer';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { GoogleCalendarListSync } from './google-calendar-list-sync';
import type { GoogleEventSync } from './google-event-sync';
import { GOOGLE_MESSAGES } from './google-messages';

export interface GoogleConnectionSyncDeps {
  readonly connections: GoogleConnectionRepository;
  readonly calendars: GoogleCalendarRepository;
  readonly calendarList: GoogleCalendarListSync;
  readonly events: GoogleEventSync;
  readonly notifier: EngineEvents;
  readonly clock: Clock;
  readonly logger: Logger;
}

const failureOf = (error: unknown): { status: 'error' | 'reauthorize'; message: string } =>
  error instanceof ReauthorizationRequiredError
    ? { status: 'reauthorize', message: GOOGLE_MESSAGES.reauthorize }
    : { status: 'error', message: errorMessage(error) };

export class GoogleConnectionSync {
  private readonly serializer = new KeyedSerializer();

  constructor(private readonly deps: GoogleConnectionSyncDeps) {}

  sync(connection: GoogleConnectionRecord): Promise<void> {
    return this.serializer.run(connection.id, () => this.run(connection));
  }

  syncCalendar(connection: GoogleConnectionRecord, calendar: GoogleCalendarRecord): Promise<void> {
    return this.serializer.run(connection.id, async () => {
      const latest = await this.deps.calendars.findById(connection.userId, calendar.id);
      if (latest === null) {
        return;
      }
      await this.syncEvents(latest);
      await this.deps.notifier.emit(connection.userId, 'calendar.updated', {
        sourceKind: 'google',
        sourceId: latest.id,
      });
    });
  }

  private async run(connection: GoogleConnectionRecord): Promise<void> {
    const attemptedAt = this.deps.clock.now().toISOString();
    try {
      const calendars = await this.deps.calendarList.sync(connection);
      const failures = await this.syncAll(calendars.filter((calendar) => calendar.enabled));
      await this.deps.connections.recordSync(connection.id, {
        status: failures === 0 ? 'ok' : 'error',
        lastError: failures === 0 ? null : 'Niektoré kalendáre sa nepodarilo synchronizovať.',
        attemptedAt,
        syncedAt: attemptedAt,
      });
    } catch (error) {
      const failure = failureOf(error);
      this.deps.logger.warn('Google calendar sync failed', {
        connectionId: connection.id,
        error: errorMessage(error),
      });
      await this.deps.connections.recordSync(connection.id, {
        status: failure.status,
        lastError: failure.message,
        attemptedAt,
        syncedAt: null,
      });
    }
    await this.deps.notifier.emit(connection.userId, 'calendar.updated', {
      sourceKind: 'google',
      sourceId: connection.id,
    });
  }

  private async syncAll(calendars: readonly GoogleCalendarRecord[]): Promise<number> {
    let failures = 0;
    for (const calendar of calendars) {
      const ok = await this.syncEvents(calendar);
      failures += ok ? 0 : 1;
    }
    return failures;
  }

  private async syncEvents(calendar: GoogleCalendarRecord): Promise<boolean> {
    try {
      await this.deps.events.sync(calendar);
      return true;
    } catch (error) {
      if (error instanceof ReauthorizationRequiredError) {
        throw error;
      }
      await this.deps.calendars.recordSync(calendar.id, {
        status: 'error',
        lastError: errorMessage(error),
        syncedAt: null,
      });
      return false;
    }
  }
}
