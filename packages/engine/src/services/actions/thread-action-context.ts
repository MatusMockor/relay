import type { MailAccount, Message, ThreadSummary, UserId } from '@relay/shared/domain';

export interface ThreadActionContext {
  readonly userId: UserId;
  readonly thread: ThreadSummary;
  readonly account: MailAccount;
  readonly messages: readonly Message[];
}
