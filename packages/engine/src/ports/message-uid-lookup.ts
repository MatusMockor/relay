import type { MailboxId, Message } from '@relay/shared/domain';

export interface MessageUidLookup {
  findByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<Message[]>;
}
