import type {
  CalendarEventId,
  CalendarInvitation,
  CalendarRsvpResponse,
  UserId,
} from '@relay/shared/domain';
import { NotFoundError, ProviderError, ValidationError } from '../../errors';
import type { AccountRepository } from '../../ports/account-repository';
import type { CalendarReplyBuilder } from '../../ports/calendar-adapters';
import type { CalendarEventRepository } from '../../ports/calendar-event-repository';
import type { Clock } from '../../ports/clock';
import type { CredentialVault } from '../../ports/credential-vault';
import type { MailSender } from '../../ports/mail-sender';
import type { MessageRepository } from '../../ports/message-repository';
import type { EngineEvents } from '../shared/engine-events';
import { errorMessage } from '../shared/mail-provider-sessions';
import { findEffective } from './effective-event';
import type { InvitationQuery } from './invitation-query';
import type { InviteResponses } from './invite-responses';
import { buildRsvpMessage } from './rsvp-message';
import { canRespond } from './rsvp-policy';
import type { SentCopySink } from './sent-copy-sink';

export interface RsvpServiceDeps {
  readonly events: CalendarEventRepository;
  readonly accounts: AccountRepository;
  readonly messages: MessageRepository;
  readonly vault: CredentialVault;
  readonly sender: MailSender;
  readonly sentCopies: SentCopySink;
  readonly replies: CalendarReplyBuilder;
  readonly invitations: InvitationQuery;
  readonly responses: InviteResponses;
  readonly notifier: EngineEvents;
  readonly clock: Clock;
}

export class RsvpService {
  constructor(private readonly deps: RsvpServiceDeps) {}

  async respond(
    userId: UserId,
    eventId: CalendarEventId,
    response: CalendarRsvpResponse,
    timeZone: string,
  ): Promise<CalendarInvitation> {
    const event = await findEffective(this.deps.events, userId, eventId);
    if (event === null || event.source.kind !== 'invite') {
      throw new NotFoundError('Calendar event', eventId);
    }
    const account = await this.deps.accounts.findById(userId, event.source.accountId);
    if (account === null) {
      throw new NotFoundError('Account', event.source.accountId);
    }
    if (!canRespond(event, account)) {
      throw new ValidationError('This invitation cannot be answered');
    }
    const credentials = await this.deps.vault.get(account.id);
    if (credentials === null) {
      throw new ProviderError(`No credentials stored for account ${account.email}`);
    }
    const now = this.deps.clock.now().toISOString();
    const attendee = { name: account.senderName, email: event.myEmail ?? account.email };
    const ics = this.deps.replies.build({ event, attendee, response, dtstamp: now });
    const invite =
      event.messageId === null ? null : await this.deps.messages.findById(userId, event.messageId);
    const message = buildRsvpMessage(
      event,
      account,
      response,
      ics,
      invite?.messageIdHeader ?? null,
    );
    const sent = await this.deps.sender
      .send(account, credentials, message)
      .catch((error: unknown) => {
        throw new ProviderError(`Sending the reply failed: ${errorMessage(error)}`, {
          cause: error,
        });
      });
    const updated = await this.deps.responses.record(userId, event, {
      ...attendee,
      partstat: response,
      repliedAt: now,
    });
    await this.deps.sentCopies.record(userId, account, sent);
    await this.deps.notifier.emit(userId, 'calendar.updated', {
      sourceKind: 'invite',
      sourceId: account.id,
    });
    const invitation = await this.deps.invitations.describe(userId, updated ?? event, timeZone);
    if (invitation === null) {
      throw new NotFoundError('Calendar event', eventId);
    }
    return invitation;
  }
}
