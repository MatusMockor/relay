import type { FailedInvitation, MailAccount, Message } from '@relay/shared/domain';
import type { PendingWork } from '../../model/pending-work';

export const toFailedInvitation = (
  account: MailAccount,
  work: PendingWork<'calendar-invite'>,
  failedAt: string,
  message: Message | null,
): FailedInvitation => ({
  accountId: account.id,
  accountEmail: account.email,
  messageId: work.payload.messageId,
  threadId: work.payload.threadId,
  subject: message?.subject ?? null,
  from: message?.from ?? null,
  date: message?.date ?? null,
  attempts: work.payload.attempts,
  failedAt,
  lastError: work.payload.lastError,
});
