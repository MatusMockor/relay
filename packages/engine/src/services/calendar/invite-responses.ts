import type { CalendarRsvpResponse, MailAccount, UserId } from '@relay/shared/domain';
import { ConflictError } from '../../errors';
import type { StoredCalendarEvent } from '../../model/calendar';
import type { AccountRepository } from '../../ports/account-repository';
import type { CalendarEventRepository } from '../../ports/calendar-event-repository';
import type { Clock } from '../../ports/clock';
import type { EngineEvents } from '../shared/engine-events';
import { findAttendee, isOlderReply, withAttendeeStatus } from './event-precedence';
import { identityKey } from './google-copies';
import { sameSlot } from './recurrence-slot';

const MAX_ATTEMPTS = 5;

export interface InviteResponse {
  readonly name: string | null;
  readonly email: string;
  readonly partstat: CalendarRsvpResponse;
  readonly repliedAt: string;
}

export interface InviteResponsesDeps {
  readonly events: CalendarEventRepository;
  readonly accounts: AccountRepository;
  readonly notifier: EngineEvents;
  readonly clock: Clock;
}

const sameInvitation = (current: StoredCalendarEvent, answered: StoredCalendarEvent): boolean =>
  current.uid === answered.uid &&
  sameSlot(current, answered) &&
  current.sequence === answered.sequence;

export class InviteResponses {
  constructor(private readonly deps: InviteResponsesDeps) {}

  async record(
    userId: UserId,
    answered: StoredCalendarEvent,
    response: InviteResponse,
  ): Promise<StoredCalendarEvent | null> {
    for (let attempt = 1; ; attempt += 1) {
      const outcome = await this.attempt(userId, answered, response);
      if (outcome.done) {
        return outcome.event;
      }
      if (attempt >= MAX_ATTEMPTS) {
        throw new ConflictError('The invitation kept changing while the answer was being stored');
      }
    }
  }

  async reconcile(
    userId: UserId,
    answered: StoredCalendarEvent,
    answer: Pick<InviteResponse, 'partstat' | 'repliedAt'>,
  ): Promise<void> {
    const identity = identityKey(answered);
    if (identity === null) {
      return;
    }
    for (const account of await this.deps.accounts.listByUser(userId)) {
      const copies = (
        await this.deps.events.findSeries({ kind: 'invite', accountId: account.id }, answered.uid)
      ).filter(
        (copy) =>
          sameSlot(copy, answered) &&
          copy.sequence <= answered.sequence &&
          identityKey(copy) === identity,
      );
      await this.reconcileCopies(userId, account, copies, answer);
    }
  }

  private async reconcileCopies(
    userId: UserId,
    account: MailAccount,
    copies: readonly StoredCalendarEvent[],
    answer: Pick<InviteResponse, 'partstat' | 'repliedAt'>,
  ): Promise<void> {
    if (copies.length === 0) {
      return;
    }
    for (const copy of copies) {
      const email = copy.myEmail ?? account.email;
      await this.record(userId, copy, { ...answer, name: account.senderName, email });
    }
    await this.deps.notifier.emit(userId, 'calendar.updated', {
      sourceKind: 'invite',
      sourceId: account.id,
    });
  }

  private async attempt(
    userId: UserId,
    answered: StoredCalendarEvent,
    response: InviteResponse,
  ): Promise<{ readonly done: boolean; readonly event: StoredCalendarEvent | null }> {
    const current = await this.deps.events.findById(userId, answered.id);
    if (current === null || !sameInvitation(current, answered)) {
      return { done: true, event: current };
    }
    if (isOlderReply(findAttendee(current.attendees, response.email), response.repliedAt)) {
      return { done: true, event: current };
    }
    const updated = await this.deps.events.updateResponse(current.id, {
      myPartstat: response.partstat,
      attendees: withAttendeeStatus(current.attendees, {
        name: response.name,
        email: response.email,
        partstat: response.partstat,
        role: null,
        repliedAt: response.repliedAt,
      }),
      updatedAt: this.deps.clock.now().toISOString(),
      expectedRevision: current.revision,
    });
    return { done: updated !== null, event: updated ?? current };
  }
}
