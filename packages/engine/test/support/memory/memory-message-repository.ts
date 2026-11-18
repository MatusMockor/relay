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
import type {
  MessageHeaders,
  MessageLocation,
  MessageRepository,
  Page,
  PageRequest,
  StoredMatchSubject,
  SubjectSearchWindow,
} from '../../../src';
import { normalizeSubject } from '../../../src';
import { type MemoryDatabase, offsetPage } from './memory-database';

const PENDING_UID = 0;

export class MemoryMessageRepository implements MessageRepository {
  constructor(private readonly db: MemoryDatabase) {}

  findById(userId: UserId, messageId: MessageId): Promise<Message | null> {
    const message = this.db.tables.messages.get(messageId);
    if (message === undefined || !this.db.ownsAccount(userId, message.accountId)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(message);
  }

  async findHeaders(userId: UserId, messageId: MessageId): Promise<MessageHeaders | null> {
    if ((await this.findById(userId, messageId)) === null) {
      return null;
    }
    return this.db.tables.messageHeaders.get(messageId) ?? new Map<string, string[]>();
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
    const match = this.all().find(
      (message) => message.mailboxId === location.mailboxId && message.uid === location.uid,
    );
    return Promise.resolve(match ?? null);
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

  listUids(mailboxId: MailboxId): Promise<number[]> {
    return Promise.resolve(
      this.all()
        .filter((message) => message.mailboxId === mailboxId)
        .map((message) => message.uid)
        .sort((a, b) => a - b),
    );
  }

  upsert(message: Message, headers: MessageHeaders): Promise<Message> {
    this.db.tables.messages.set(message.id, message);
    this.db.tables.messageHeaders.set(message.id, headers);
    return Promise.resolve(message);
  }

  listMatchSubjects(accountId: AccountId, page: PageRequest): Promise<Page<StoredMatchSubject>> {
    const subjects = this.all()
      .filter((message) => message.accountId === accountId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((message) => ({
        messageId: message.id,
        threadId: message.threadId,
        subject: {
          from: message.from,
          subject: message.subject,
          headers: this.db.tables.messageHeaders.get(message.id) ?? new Map<string, string[]>(),
        },
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
    const labelIds = this.db.tables.messages.get(messageId)?.labelIds ?? [];
    return this.patch(messageId, { labelIds: [...new Set([...labelIds, labelId])] });
  }

  removeLabel(messageId: MessageId, labelId: LabelId): Promise<void> {
    const labelIds = this.db.tables.messages.get(messageId)?.labelIds ?? [];
    return this.patch(messageId, { labelIds: labelIds.filter((id) => id !== labelId) });
  }

  move(messageId: MessageId, target: MessageLocation): Promise<void> {
    const occupied = this.all().some(
      (message) =>
        message.id !== messageId &&
        message.mailboxId === target.mailboxId &&
        message.uid === target.uid &&
        target.uid !== PENDING_UID,
    );
    if (occupied) {
      return Promise.reject(new Error('Unique constraint failed: messages (mailbox_id, uid)'));
    }
    return this.patch(messageId, { mailboxId: target.mailboxId, uid: target.uid });
  }

  deleteByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<ThreadId[]> {
    const removed = this.all().filter(
      (message) => message.mailboxId === mailboxId && uids.includes(message.uid),
    );
    removed.forEach((message) => {
      this.db.tables.messages.delete(message.id);
      this.db.tables.messageHeaders.delete(message.id);
    });
    return Promise.resolve([...new Set(removed.map((message) => message.threadId))]);
  }

  private patch(messageId: MessageId, changes: Partial<Message>): Promise<void> {
    const message = this.db.tables.messages.get(messageId);
    if (message !== undefined) {
      this.db.tables.messages.set(messageId, { ...message, ...changes });
    }
    return Promise.resolve();
  }

  private all(): Message[] {
    return [...this.db.tables.messages.values()];
  }
}
