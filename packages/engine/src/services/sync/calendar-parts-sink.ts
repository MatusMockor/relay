import type {
  MailAccount,
  MailboxId,
  MailboxRole,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import type { PendingWorkRepository } from '../../ports/pending-work-repository';

export interface CalendarParts {
  readonly account: MailAccount;
  readonly mailboxRole: MailboxRole;
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly parts: readonly string[];
  readonly publish: boolean;
}

export interface CalendarPartsArrival extends CalendarParts {
  readonly hold: boolean;
}

export interface CalendarPartsSink {
  queue(work: PendingWorkRepository, arrival: CalendarPartsArrival): Promise<void>;
  release(userId: UserId, account: MailAccount, mailboxOrder: readonly MailboxId[]): Promise<void>;
  flush(userId: UserId, account: MailAccount): Promise<void>;
}
