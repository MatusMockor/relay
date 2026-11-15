import type {
  AccountId,
  LabelId,
  MailboxId,
  Message,
  MessageFlags,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';

export interface MessageLocation {
  readonly mailboxId: MailboxId;
  readonly uid: number;
}

export interface MessageRepository {
  findById(userId: UserId, messageId: MessageId): Promise<Message | null>;
  listByThread(userId: UserId, threadId: ThreadId): Promise<Message[]>;
  findByLocation(location: MessageLocation): Promise<Message | null>;
  findByMessageIdHeaders(accountId: AccountId, headers: readonly string[]): Promise<Message[]>;
  listUids(mailboxId: MailboxId): Promise<number[]>;
  upsert(message: Message): Promise<Message>;
  updateFlags(messageId: MessageId, flags: MessageFlags): Promise<void>;
  updateLabels(messageId: MessageId, labelIds: readonly LabelId[]): Promise<void>;
  move(messageId: MessageId, target: MessageLocation): Promise<void>;
  deleteByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<ThreadId[]>;
}
