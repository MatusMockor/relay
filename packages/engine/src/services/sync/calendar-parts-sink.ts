import type { MailAccount, MailboxRole, MessageId, ThreadId, UserId } from '@relay/shared/domain';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';

export interface CalendarPartsArrival {
  readonly account: MailAccount;
  readonly mailboxRole: MailboxRole;
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly parts: readonly string[];
  readonly publish: boolean;
}

export interface CalendarPartsSink {
  queue(work: PendingWorkRepository, arrival: CalendarPartsArrival): Promise<void>;
  flush(userId: UserId, account: MailAccount): Promise<void>;
}
