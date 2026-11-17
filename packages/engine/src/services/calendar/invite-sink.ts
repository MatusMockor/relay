import type { MailAccount, MailboxId, UserId } from '@relay/shared/domain';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { CalendarPartsArrival, CalendarPartsSink } from '../sync/calendar-parts-sink';
import type { HeldInviteRelease } from './held-invite-release';
import type { InviteQueue } from './invite-queue';
import type { InviteWorkProcessor } from './invite-work-processor';

export class InviteSink implements CalendarPartsSink {
  constructor(
    private readonly queuer: InviteQueue,
    private readonly processor: InviteWorkProcessor,
    private readonly held: HeldInviteRelease,
  ) {}

  queue(work: PendingWorkRepository, arrival: CalendarPartsArrival): Promise<void> {
    return this.queuer.queue(work, arrival);
  }

  hasHeld(account: MailAccount): Promise<boolean> {
    return this.held.hasHeld(account);
  }

  release(userId: UserId, account: MailAccount, mailboxOrder: readonly MailboxId[]): Promise<void> {
    return this.held.release(userId, account, mailboxOrder);
  }

  flush(userId: UserId, account: MailAccount): Promise<void> {
    return this.processor.processDue(userId, account);
  }
}
