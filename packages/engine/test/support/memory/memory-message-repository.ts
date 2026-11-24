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
import { PENDING_UID } from '@relay/shared/domain';
import type {
  MessageHeaders,
  MessageLocation,
  MessageRepository,
  Page,
  PageRequest,
  PlacementIdentity,
  PlacementMatch,
  PlacementMove,
  PlaceOutcome,
  PlaceRequest,
  StoredMatchSubject,
  SubjectSearchWindow,
} from '../../../src';
import { matchSubjectOf, normalizeSubject } from '../../../src';
import { type MemoryDatabase, offsetPage } from './memory-database';
import { matchPlacementIn, placeIn } from './memory-message-placing';
import {
  deleteAtUids,
  forgetMailboxPlacements,
  removePlacementOf,
} from './memory-placement-removal';
import { movePlacementOf } from './memory-placement-writes';
import { isPlacedAt, placedAt, placedIn } from './memory-placements';

export class MemoryMessageRepository implements MessageRepository {
  constructor(private readonly db: MemoryDatabase) {}

  findById(userId: UserId, messageId: MessageId): Promise<Message | null> {
    const message = this.db.tables.messages.get(this.resolve(messageId));
    if (message === undefined || !this.db.ownsAccount(userId, message.accountId)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(message);
  }

  async findHeaders(userId: UserId, messageId: MessageId): Promise<MessageHeaders | null> {
    if ((await this.findById(userId, messageId)) === null) {
      return null;
    }
    return (
      this.db.tables.messageHeaders.get(this.resolve(messageId)) ?? new Map<string, string[]>()
    );
  }

  listByThread(userId: UserId, threadId: ThreadId): Promise<Message[]> {
    return Promise.resolve(
      this.all().filter(
        (message) =>
          message.threadId === threadId && this.db.ownsAccount(userId, message.accountId),
      ),
    );
  }

  findByLocation(location: MessageLocation): Promise<Message | null> {
    return Promise.resolve(this.all().find((message) => isPlacedAt(message, location)) ?? null);
  }

  findByEmailId(accountId: AccountId, emailId: string): Promise<Message[]> {
    return Promise.resolve(
      this.all().filter(
        (message) => message.accountId === accountId && message.emailId === emailId,
      ),
    );
  }

  findByMessageIdHeaders(accountId: AccountId, headers: readonly string[]): Promise<Message[]> {
    return Promise.resolve(
      this.all().filter(
        (message) =>
          message.accountId === accountId &&
          message.messageIdHeader !== null &&
          headers.includes(message.messageIdHeader),
      ),
    );
  }

  findThreadIdBySubject(
    accountId: AccountId,
    normalizedSubject: string,
    window: SubjectSearchWindow,
  ): Promise<ThreadId | null> {
    const match = this.all()
      .filter((message) => {
        const at = Date.parse(message.date);
        return (
          message.accountId === accountId &&
          normalizeSubject(message.subject).value === normalizedSubject &&
          at >= window.since.getTime() &&
          at <= window.until.getTime()
        );
      })
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
    return Promise.resolve(match?.threadId ?? null);
  }

  findThreadIdByReplyTo(
    accountId: AccountId,
    messageIds: readonly string[],
  ): Promise<ThreadId | null> {
    const match = this.all()
      .filter(
        (message) =>
          message.accountId === accountId &&
          message.inReplyTo !== null &&
          messageIds.includes(message.inReplyTo),
      )
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))[0];
    return Promise.resolve(match?.threadId ?? null);
  }

  listThreadIdsByLabel(labelId: LabelId): Promise<ThreadId[]> {
    const threadIds = this.all()
      .filter((message) => message.labelIds.includes(labelId))
      .map((message) => message.threadId);
    return Promise.resolve([...new Set(threadIds)]);
  }

  listUids(mailboxId: MailboxId): Promise<number[]> {
    return Promise.resolve(
      this.all()
        .flatMap((message) => placedIn(message, mailboxId))
        .map((placement) => placement.uid)
        .filter((uid) => uid > PENDING_UID)
        .sort((a, b) => a - b),
    );
  }

  upsert(message: Message, headers: MessageHeaders): Promise<Message> {
    const stored = placedAt(message, message);
    this.db.tables.messages.set(message.id, stored);
    this.db.tables.messageHeaders.set(message.id, headers);
    return Promise.resolve(stored);
  }

  listMatchSubjects(accountId: AccountId, page: PageRequest): Promise<Page<StoredMatchSubject>> {
    const subjects = this.all()
      .filter((message) => message.accountId === accountId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((message) => ({
        messageId: message.id,
        threadId: message.threadId,
        subject: matchSubjectOf(
          message,
          this.db.tables.messageHeaders.get(message.id) ?? new Map<string, string[]>(),
        ),
      }));
    return Promise.resolve(offsetPage(subjects, page.cursor, page.limit));
  }

  updateFlags(messageId: MessageId, flags: MessageFlags): Promise<void> {
    return this.patch(messageId, { flags });
  }

  updateLabels(messageId: MessageId, labelIds: readonly LabelId[]): Promise<void> {
    return this.patch(messageId, { labelIds: [...labelIds] });
  }

  addLabel(messageId: MessageId, labelId: LabelId): Promise<void> {
    const labelIds = this.db.tables.messages.get(this.resolve(messageId))?.labelIds ?? [];
    return this.patch(messageId, { labelIds: [...new Set([...labelIds, labelId])] });
  }

  removeLabel(messageId: MessageId, labelId: LabelId): Promise<void> {
    const labelIds = this.db.tables.messages.get(this.resolve(messageId))?.labelIds ?? [];
    return this.patch(messageId, { labelIds: labelIds.filter((id) => id !== labelId) });
  }

  matchPlacement(identity: PlacementIdentity): Promise<PlacementMatch | null> {
    return Promise.resolve(matchPlacementIn(this.db, identity));
  }

  place(request: PlaceRequest): Promise<PlaceOutcome> {
    return Promise.resolve(placeIn(this.db, request));
  }

  movePlacement(messageId: MessageId, move: PlacementMove): Promise<void> {
    return movePlacementOf(this.db, this.resolve(messageId), move);
  }

  removePlacement(messageId: MessageId, mailboxId: MailboxId): Promise<ThreadId[]> {
    return Promise.resolve(removePlacementOf(this.db, this.resolve(messageId), mailboxId));
  }

  forgetMailbox(mailboxId: MailboxId): Promise<ThreadId[]> {
    return Promise.resolve(forgetMailboxPlacements(this.db, mailboxId));
  }

  deleteByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<ThreadId[]> {
    return Promise.resolve(deleteAtUids(this.db, mailboxId, uids));
  }

  private patch(messageId: MessageId, changes: Partial<Message>): Promise<void> {
    const id = this.resolve(messageId);
    const message = this.db.tables.messages.get(id);
    if (message !== undefined) {
      this.db.tables.messages.set(id, { ...message, ...changes });
    }
    return Promise.resolve();
  }

  private resolve(messageId: MessageId): MessageId {
    return this.db.tables.messageAliases.get(messageId) ?? messageId;
  }

  private all(): Message[] {
    return [...this.db.tables.messages.values()];
  }
}
