import type { MailboxId, Message } from '@relay/shared';

export const placedIn = (message: Message, mailboxId: MailboxId): Message => ({
  ...message,
  mailboxId,
  placements: [{ mailboxId, uid: message.uid }],
});
