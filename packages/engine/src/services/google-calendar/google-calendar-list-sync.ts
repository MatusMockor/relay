import type {
  GoogleCalendarRecord,
  GoogleConnectionRecord,
  RemoteGoogleCalendar,
} from '../../model/google-calendar';
import type { Clock } from '../../ports/clock';
import type { GoogleCalendarGateway } from '../../ports/google-calendar-adapters';
import type { GoogleCalendarDetails } from '../../ports/google-calendar-repositories';
import type { IdGenerator } from '../../ports/id-generator';
import type { UnitOfWork } from '../../ports/unit-of-work';
import { FALLBACK_CALENDAR_COLOR } from '../calendar/calendar-colors';

export interface GoogleCalendarListSyncDeps {
  readonly gateway: GoogleCalendarGateway;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
}

const detailsOf = (remote: RemoteGoogleCalendar, now: string): GoogleCalendarDetails => ({
  name: remote.name,
  primary: remote.primary,
  accessRole: remote.accessRole,
  timeZone: remote.timeZone,
  updatedAt: now,
});

const isColor = (value: string | null): value is string =>
  value !== null && /^#[0-9a-fA-F]{6}$/.test(value);

export class GoogleCalendarListSync {
  constructor(private readonly deps: GoogleCalendarListSyncDeps) {}

  async sync(connection: GoogleConnectionRecord): Promise<GoogleCalendarRecord[]> {
    const remote = (await this.deps.gateway.listCalendars(connection.id)).filter(
      (calendar) => calendar.accessRole !== 'freeBusyReader',
    );
    const now = this.deps.clock.now().toISOString();
    return this.deps.unitOfWork.run(async (repositories) => {
      const existing = await repositories.googleCalendars.listByConnection(connection.id);
      const byRemoteId = new Map(existing.map((record) => [record.remoteId, record]));
      const seen = new Set(remote.map((calendar) => calendar.remoteId));
      for (const stale of existing.filter((record) => !seen.has(record.remoteId))) {
        await repositories.googleCalendars.delete(stale.id);
      }
      const saved: GoogleCalendarRecord[] = [];
      for (const calendar of remote) {
        const existing = byRemoteId.get(calendar.remoteId);
        const details = detailsOf(calendar, now);
        const stored =
          existing === undefined
            ? await repositories.googleCalendars.save(this.created(connection, calendar, now))
            : await repositories.googleCalendars.updateDetails(existing.id, details);
        saved.push(...(stored === null ? [] : [stored]));
      }
      return saved;
    });
  }

  private created(
    connection: GoogleConnectionRecord,
    remote: RemoteGoogleCalendar,
    now: string,
  ): GoogleCalendarRecord {
    return {
      ...detailsOf(remote, now),
      id: this.deps.ids.generate('googleCalendar'),
      userId: connection.userId,
      connectionId: connection.id,
      remoteId: remote.remoteId,
      color: isColor(remote.color) ? remote.color.toLowerCase() : FALLBACK_CALENDAR_COLOR,
      enabled: remote.primary || remote.selected,
      status: 'pending',
      lastError: null,
      lastSyncedAt: null,
      syncToken: null,
      createdAt: now,
    };
  }
}
