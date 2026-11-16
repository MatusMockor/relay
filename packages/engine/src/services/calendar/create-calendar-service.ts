import type { EngineDeps } from '../../engine-deps';
import type { EngineEvents } from '../shared/engine-events';
import { CalendarColors } from './calendar-colors';
import { CalendarService } from './calendar-service';
import { GoogleAccessLookup } from '../google-calendar/google-access-lookup';
import { GoogleCalendarVisibility } from '../google-calendar/google-calendar-visibility';
import { createRsvpService } from './google-first-rsvp';
import type { RemoteRsvp } from './remote-rsvp';
import { DEFAULT_FEED_REFRESH_SECONDS, DueSubscriptions } from './due-subscriptions';
import { InvitationQuery } from './invitation-query';
import { InvitationTimingResolver } from './invitation-timing';
import { InviteResponses } from './invite-responses';
import { OccurrenceQuery } from './occurrence-query';
import { FeedLoader } from './feed-loader';
import { SubscriptionRefresher } from './subscription-refresher';
import type { SentCopySink } from './sent-copy-sink';
import { SubscriptionService } from './subscription-service';

export type CalendarEngineDeps = Pick<
  EngineDeps,
  | 'repositories'
  | 'unitOfWork'
  | 'calendar'
  | 'credentialVault'
  | 'mailSender'
  | 'clock'
  | 'idGenerator'
  | 'logger'
  | 'options'
>;

export const createCalendarComponents = (
  deps: CalendarEngineDeps,
  notifier: EngineEvents,
  sentCopies: SentCopySink,
  remoteRsvp: RemoteRsvp | null = null,
): CalendarService => {
  const { repositories, unitOfWork, calendar, clock, idGenerator: ids, logger } = deps;
  const occurrences = new OccurrenceQuery({
    events: repositories.calendarEvents,
    expander: calendar.expander,
    colors: new CalendarColors(
      repositories.accounts,
      repositories.calendarSubscriptions,
      repositories.googleCalendars,
    ),
    access: new GoogleAccessLookup(repositories.googleCalendars),
    visibility: new GoogleCalendarVisibility(repositories.googleCalendars),
  });
  const invitations = new InvitationQuery({
    events: repositories.calendarEvents,
    accounts: repositories.accounts,
    timing: new InvitationTimingResolver(calendar.expander),
    occurrences,
    clock,
  });
  const loader = new FeedLoader(calendar, ids);
  const refresher = new SubscriptionRefresher({
    adapters: calendar,
    loader,
    unitOfWork,
    notifier,
    clock,
    logger: logger.child({ component: 'calendar-feeds' }),
  });
  return new CalendarService({
    occurrences,
    invitations,
    rsvp: createRsvpService(
      {
        events: repositories.calendarEvents,
        accounts: repositories.accounts,
        messages: repositories.messages,
        vault: deps.credentialVault,
        sender: deps.mailSender,
        sentCopies,
        replies: calendar.replyBuilder,
        invitations,
        responses: new InviteResponses({
          events: repositories.calendarEvents,
          accounts: repositories.accounts,
          notifier,
          clock,
        }),
        notifier,
        clock,
      },
      remoteRsvp,
    ),
    subscriptions: new SubscriptionService({
      subscriptions: repositories.calendarSubscriptions,
      secrets: calendar.feedSecrets,
      refresher,
      loader,
      unitOfWork,
      notifier,
      clock,
      ids,
    }),
    due: new DueSubscriptions({
      subscriptions: repositories.calendarSubscriptions,
      refresher,
      clock,
      refreshSeconds: deps.options.calendar?.feedRefreshSeconds ?? DEFAULT_FEED_REFRESH_SECONDS,
    }),
  });
};
