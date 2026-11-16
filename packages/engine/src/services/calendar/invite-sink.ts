import type { MailAccount, UserId } from '@relay/shared/domain';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';
import type { CalendarPartsArrival, CalendarPartsSink } from '../sync/calendar-parts-sink';
import type { InviteQueue } from './invite-queue';
import type { InviteWorkProcessor } from './invite-work-processor';

export class InviteSink implements CalendarPartsSink {
  constructor(
    private readonly queuer: InviteQueue,
    private readonly processor: InviteWorkProcessor,
  ) {}

  queue(work: PendingWorkRepository, arrival: CalendarPartsArrival): Promise<void> {
    return this.queuer.queue(work, arrival);
  }

  flush(userId: UserId, account: MailAccount): Promise<void> {
    return this.processor.processDue(userId, account);
  }
}
