import type {
  CalendarEventId,
  CalendarInvitation,
  CalendarRsvpResponse,
  UserId,
} from '@relay/shared/domain';
import { ValidationError } from '../../errors';
import { findEffective } from './effective-event';
import type { RemoteRsvp } from './remote-rsvp';
import { canRespond } from './rsvp-policy';
import { RsvpService, type RsvpServiceDeps } from './rsvp-service';

export class GoogleFirstRsvpService extends RsvpService {
  constructor(
    private readonly base: RsvpServiceDeps,
    private readonly remote: RemoteRsvp,
  ) {
    super(base);
  }

  override async respond(
    userId: UserId,
    eventId: CalendarEventId,
    response: CalendarRsvpResponse,
    timeZone: string,
  ): Promise<CalendarInvitation> {
    const event = await findEffective(this.base.events, userId, eventId);
    if (event?.source.kind !== 'invite') {
      return super.respond(userId, eventId, response, timeZone);
    }
    const account = await this.base.accounts.findById(userId, event.source.accountId);
    if (account === null || !canRespond(event, account)) {
      return super.respond(userId, eventId, response, timeZone);
    }
    const repliedAt = this.base.clock.now().toISOString();
    if (!(await this.remote.respond(userId, event, response))) {
      return super.respond(userId, eventId, response, timeZone);
    }
    const updated = await this.base.responses.record(userId, event, {
      name: account.senderName,
      email: event.myEmail ?? account.email,
      partstat: response,
      repliedAt,
    });
    await this.base.notifier.emit(userId, 'calendar.updated', {
      sourceKind: 'invite',
      sourceId: account.id,
    });
    const invitation = await this.base.invitations.describe(userId, updated ?? event, timeZone);
    if (invitation === null) {
      throw new ValidationError('This invitation cannot be answered');
    }
    return invitation;
  }
}

export const createRsvpService = (deps: RsvpServiceDeps, remote: RemoteRsvp | null): RsvpService =>
  remote === null ? new RsvpService(deps) : new GoogleFirstRsvpService(deps, remote);
