import type {
  CalendarConflict,
  CalendarInvitation,
  MailAccount,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type { StoredCalendarEvent } from '../../model/calendar';
import type { AccountRepository } from '../../ports/account-repository';
import type { CalendarEventRepository } from '../../ports/calendar-event-repository';
import type { Clock } from '../../ports/clock';
import type { InvitationTiming, InvitationTimingResolver } from './invitation-timing';
import type { OccurrenceQuery } from './occurrence-query';
import { canRespond } from './rsvp-policy';
import { cutOffByRange } from './series-cut';

const MAX_CONFLICTS = 5;

export interface InvitationQueryDeps {
  readonly events: CalendarEventRepository;
  readonly accounts: AccountRepository;
  readonly timing: InvitationTimingResolver;
  readonly occurrences: OccurrenceQuery;
  readonly clock: Clock;
}

export class InvitationQuery {
  constructor(private readonly deps: InvitationQueryDeps) {}

  async forThread(
    userId: UserId,
    threadId: ThreadId,
    timeZone: string,
  ): Promise<CalendarInvitation[]> {
    const linked = await this.deps.events.listByThread(userId, threadId);
    const described = await Promise.all(
      linked.map((event) => this.describe(userId, event, timeZone)),
    );
    return described.filter((invitation) => invitation !== null);
  }

  async describe(
    userId: UserId,
    event: StoredCalendarEvent,
    timeZone: string,
  ): Promise<CalendarInvitation | null> {
    if (event.source.kind !== 'invite') {
      return null;
    }
    const account = await this.deps.accounts.findById(userId, event.source.accountId);
    if (account === null) {
      return null;
    }
    const series = await this.deps.events.findSeries(event.source, event.uid);
    const shown = cutOffByRange(series, event) ? { ...event, status: 'cancelled' as const } : event;
    const now = this.deps.clock.now().toISOString();
    const timing = this.deps.timing.resolve(shown, series, timeZone, now);
    return {
      ...this.details(shown, account),
      ...timing,
      conflicts: await this.conflicts(userId, shown, timing, timeZone),
    };
  }

  private details(
    event: StoredCalendarEvent,
    account: MailAccount,
  ): Omit<CalendarInvitation, 'start' | 'end' | 'allDay' | 'conflicts'> {
    return {
      eventId: event.id,
      accountId: account.id,
      messageId: event.messageId,
      threadId: event.threadId,
      method: event.method,
      uid: event.uid,
      title: event.summary,
      location: event.location,
      description: event.description,
      organizer: event.organizer,
      attendees: [...event.attendees],
      recurring: event.recurring,
      status: event.status,
      myStatus: event.myPartstat,
      canRespond: canRespond(event, account),
    };
  }

  private async conflicts(
    userId: UserId,
    event: StoredCalendarEvent,
    timing: InvitationTiming,
    timeZone: string,
  ): Promise<CalendarConflict[]> {
    if (
      timing.allDay ||
      event.status === 'cancelled' ||
      Date.parse(timing.end) <= Date.parse(timing.start)
    ) {
      return [];
    }
    const overlapping = await this.deps.occurrences.expand(userId, {
      from: timing.start,
      to: timing.end,
      timeZone,
    });
    return overlapping
      .filter(
        (other) =>
          other.event.uid !== event.uid &&
          !other.allDay &&
          other.event.myPartstat !== 'declined' &&
          Date.parse(other.start) < Date.parse(timing.end) &&
          Date.parse(other.end) > Date.parse(timing.start),
      )
      .slice(0, MAX_CONFLICTS)
      .map((other) => ({
        title: other.event.summary,
        start: other.start,
        end: other.end,
        allDay: other.allDay,
      }));
  }
}
