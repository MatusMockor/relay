import type { MailboxId, MessageId } from '@relay/shared/domain';

export const placementKey = (messageId: MessageId, mailboxId: MailboxId): string =>
  `${messageId}:${mailboxId}`;
