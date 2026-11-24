import type { Page, PageRequest } from '../model/page';
import type {
  PlacementIdentity,
  PlacementMatch,
  PlacementMove,
  PlacementRemoval,
  PlaceOutcome,
  PlaceRequest,
} from '../model/placement-ingest';
import type { MessageHeaders, SplitMatchSubject } from '../model/split-match-subject';
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

export interface StoredMatchSubject {
  readonly messageId: MessageId;
  readonly threadId: ThreadId;
  readonly subject: SplitMatchSubject;
}

export interface SubjectSearchWindow {
  readonly since: Date;
  readonly until: Date;
}

export interface MessageRepository {
  findById(userId: UserId, messageId: MessageId): Promise<Message | null>;
  findHeaders(userId: UserId, messageId: MessageId): Promise<MessageHeaders | null>;
  listByThread(userId: UserId, threadId: ThreadId): Promise<Message[]>;
  findByLocation(location: MessageLocation): Promise<Message | null>;
  findByMessageIdHeaders(accountId: AccountId, headers: readonly string[]): Promise<Message[]>;
  findByEmailId(accountId: AccountId, emailId: string): Promise<Message[]>;
  findThreadIdBySubject(
    accountId: AccountId,
    normalizedSubject: string,
    window: SubjectSearchWindow,
  ): Promise<ThreadId | null>;
  findThreadIdByReplyTo(
    accountId: AccountId,
    messageIds: readonly string[],
  ): Promise<ThreadId | null>;
  listUids(mailboxId: MailboxId): Promise<number[]>;
  listThreadIdsByLabel(labelId: LabelId): Promise<ThreadId[]>;
  upsert(message: Message, headers: MessageHeaders): Promise<Message>;
  listMatchSubjects(accountId: AccountId, page: PageRequest): Promise<Page<StoredMatchSubject>>;
  updateFlags(messageId: MessageId, flags: MessageFlags): Promise<void>;
  updateLabels(messageId: MessageId, labelIds: readonly LabelId[]): Promise<void>;
  addLabel(messageId: MessageId, labelId: LabelId): Promise<void>;
  removeLabel(messageId: MessageId, labelId: LabelId): Promise<void>;
  matchPlacement(identity: PlacementIdentity): Promise<PlacementMatch | null>;
  place(request: PlaceRequest): Promise<PlaceOutcome>;
  movePlacement(messageId: MessageId, move: PlacementMove): Promise<void>;
  removePlacement(
    messageId: MessageId,
    mailboxId: MailboxId,
    successor?: MessageId,
  ): Promise<PlacementRemoval>;
  forgetMailbox(mailboxId: MailboxId): Promise<ThreadId[]>;
  deleteByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<ThreadId[]>;
}
