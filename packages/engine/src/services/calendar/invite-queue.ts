import type { MailboxRole } from '@relay/shared/domain';
import type { Clock } from '../../ports/clock';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { CalendarPartsArrival } from '../sync/calendar-parts-sink';

const IGNORED_ROLES: ReadonlySet<MailboxRole> = new Set(['drafts', 'spam']);

export const acceptsInvites = (role: MailboxRole): boolean => !IGNORED_ROLES.has(role);

export class InviteQueue {
  constructor(private readonly clock: Clock) {}

  async queue(work: PendingWorkRepository, arrival: CalendarPartsArrival): Promise<void> {
    if (!acceptsInvites(arrival.mailboxRole) || arrival.parts.length === 0) {
      return;
    }
    await work.put({
      accountId: arrival.account.id,
      kind: 'calendar-invite',
      ref: arrival.messageId,
      payload: {
        messageId: arrival.messageId,
        threadId: arrival.threadId,
        mailboxRole: arrival.mailboxRole,
        parts: [...arrival.parts],
        publish: arrival.publish,
        attempts: 0,
        nextAttemptAt: null,
        failedAt: null,
        lastError: null,
      },
      createdAt: this.clock.now().toISOString(),
    });
  }
}
