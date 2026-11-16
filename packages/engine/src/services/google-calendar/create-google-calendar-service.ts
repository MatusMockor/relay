import type { EngineDeps } from '../../engine-deps';
import { InviteResponses } from '../calendar/invite-responses';
import type { EngineEvents } from '../shared/engine-events';
import { DEFAULT_GOOGLE_SYNC_SECONDS, DueGoogleConnections } from './due-google-connections';
import { GoogleAttendance } from './google-attendance';
import { GoogleCalendarListSync } from './google-calendar-list-sync';
import { GoogleCalendarPreferencesService } from './google-calendar-preferences';
import { GoogleCalendarService } from './google-calendar-service';
import { GoogleChangeApplier } from './google-change-applier';
import { GoogleConnectionService } from './google-connection-service';
import { GoogleConnectionSync } from './google-connection-sync';
import { GoogleEventService } from './google-event-service';
import { GoogleEventStore } from './google-event-store';
import { GoogleEventSync } from './google-event-sync';
import { GoogleInviteRsvp } from './google-invite-rsvp';
import { UNCONFIGURED_GOOGLE_CALENDAR } from './unconfigured-google-calendar';

export type GoogleCalendarEngineDeps = Pick<
  EngineDeps,
  | 'repositories'
  | 'unitOfWork'
  | 'googleCalendar'
  | 'calendar'
  | 'clock'
  | 'idGenerator'
  | 'logger'
  | 'options'
>;

export interface GoogleCalendarComponents {
  readonly service: GoogleCalendarService;
  readonly inviteRsvp: GoogleInviteRsvp;
}

export const createGoogleCalendarComponents = (
  deps: GoogleCalendarEngineDeps,
  notifier: EngineEvents,
): GoogleCalendarComponents => {
  const { repositories, unitOfWork, clock, idGenerator: ids } = deps;
  const adapters = deps.googleCalendar ?? UNCONFIGURED_GOOGLE_CALENDAR;
  const { gateway } = adapters;
  const logger = deps.logger.child({ component: 'google-calendar' });
  const sync = new GoogleConnectionSync({
    connections: repositories.googleConnections,
    calendars: repositories.googleCalendars,
    calendarList: new GoogleCalendarListSync({ gateway, unitOfWork, clock, ids }),
    events: new GoogleEventSync({
      gateway,
      unitOfWork,
      applier: new GoogleChangeApplier(ids),
      clock,
    }),
    notifier,
    clock,
    logger,
  });
  const store = new GoogleEventStore({ unitOfWork, notifier, clock, ids });
  const attendance = new GoogleAttendance(gateway, store);
  const preferences = new GoogleCalendarPreferencesService({
    repositories,
    unitOfWork,
    sync,
    notifier,
    clock,
    logger,
  });
  const service = new GoogleCalendarService({
    connections: new GoogleConnectionService({
      repositories,
      accounts: repositories.accounts,
      adapters,
      sync,
      preferences,
      notifier,
      clock,
      ids,
    }),
    events: new GoogleEventService({
      repositories,
      gateway,
      store,
      attendance,
      responses: new InviteResponses({
        events: repositories.calendarEvents,
        accounts: repositories.accounts,
        notifier,
        clock,
      }),
      membership: deps.calendar.expander,
      clock,
    }),
    due: new DueGoogleConnections({
      connections: repositories.googleConnections,
      sync,
      clock,
      syncSeconds: deps.options.calendar?.googleSyncSeconds ?? DEFAULT_GOOGLE_SYNC_SECONDS,
    }),
  });
  return {
    service,
    inviteRsvp: new GoogleInviteRsvp(repositories, attendance, deps.calendar.expander),
  };
};
