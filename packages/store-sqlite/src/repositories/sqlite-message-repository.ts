import type {
  MessageHeaders,
  MessageLocation,
  MessageRepository,
  Page,
  PageRequest,
  StoredMatchSubject,
  SubjectSearchWindow,
} from '@relay/engine';
import {
  type AccountId,
  type LabelId,
  type MailboxId,
  type Message,
  type MessageFlags,
  type MessageId,
  type ThreadId,
  ThreadIdSchema,
  type UserId,
} from '@relay/shared/domain';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toMessage, toMessageHeaders, toMessageRow } from '../mappers/message-mapper';
import { type MessageRow, messageLabels, messages } from '../schema';
import { accountOwnerOf } from './account-owner';
import { chunked } from './chunked';
import { listMatchSubjects } from './match-subject-query';
import { readMessageLabels } from './message-label-reader';

export class SqliteMessageRepository implements MessageRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  findById(userId: UserId, messageId: MessageId): Promise<Message | null> {
    return this.executor.execute((db) =>
      this.first(
        db,
        db
          .select()
          .from(messages)
          .where(and(eq(messages.userId, userId), eq(messages.id, messageId)))
          .all(),
      ),
    );
  }

  findHeaders(userId: UserId, messageId: MessageId): Promise<MessageHeaders | null> {
    return this.executor.execute((db) => {
      const row = db
        .select({ headers: messages.headers })
        .from(messages)
        .where(and(eq(messages.userId, userId), eq(messages.id, messageId)))
        .get();
      return row === undefined ? null : toMessageHeaders(row.headers);
    });
  }

  listByThread(userId: UserId, threadId: ThreadId): Promise<Message[]> {
    return this.executor.execute((db) =>
      this.hydrate(
        db,
        db
          .select()
          .from(messages)
          .where(and(eq(messages.userId, userId), eq(messages.threadId, threadId)))
          .orderBy(asc(messages.dateTs), asc(messages.seq))
          .all(),
      ),
    );
  }

  findByLocation(location: MessageLocation): Promise<Message | null> {
    return this.executor.execute((db) =>
      this.first(
        db,
        db
          .select()
          .from(messages)
          .where(and(eq(messages.mailboxId, location.mailboxId), eq(messages.uid, location.uid)))
          .all(),
      ),
    );
  }

  findByMessageIdHeaders(accountId: AccountId, headers: readonly string[]): Promise<Message[]> {
    return this.executor.execute((db) =>
      this.hydrate(
        db,
        chunked(headers)
          .flatMap((chunk) =>
            db
              .select()
              .from(messages)
              .where(
                and(eq(messages.accountId, accountId), inArray(messages.messageIdHeader, chunk)),
              )
              .all(),
          )
          .sort((left, right) => left.dateTs - right.dateTs || left.seq - right.seq),
      ),
    );
  }

  findThreadIdBySubject(
    accountId: AccountId,
    normalizedSubject: string,
    window: SubjectSearchWindow,
  ): Promise<ThreadId | null> {
    return this.executor.execute((db) => {
      const row = db
        .select({ threadId: messages.threadId })
        .from(messages)
        .where(
          and(
            eq(messages.accountId, accountId),
            eq(messages.normalizedSubject, normalizedSubject),
            gte(messages.dateTs, window.since.getTime()),
            lte(messages.dateTs, window.until.getTime()),
          ),
        )
        .orderBy(desc(messages.dateTs), desc(messages.seq))
        .get();
      return row === undefined ? null : ThreadIdSchema.parse(row.threadId);
    });
  }

  listUids(mailboxId: MailboxId): Promise<number[]> {
    return this.executor.execute((db) =>
      db
        .select({ uid: messages.uid })
        .from(messages)
        .where(eq(messages.mailboxId, mailboxId))
        .orderBy(asc(messages.uid))
        .all()
        .map((row) => row.uid),
    );
  }

  upsert(message: Message, headers: MessageHeaders): Promise<Message> {
    return this.executor.execute((db) => {
      const row = toMessageRow(accountOwnerOf(db, message.accountId), message, headers);
      const { id: _id, ...changes } = row;
      db.insert(messages)
        .values(row)
        .onConflictDoUpdate({ target: messages.id, set: changes })
        .run();
      this.replaceLabels(db, message.id, message.labelIds);
      return message;
    });
  }

  listMatchSubjects(accountId: AccountId, page: PageRequest): Promise<Page<StoredMatchSubject>> {
    return this.executor.execute((db) => listMatchSubjects(db, accountId, page));
  }

  updateFlags(messageId: MessageId, flags: MessageFlags): Promise<void> {
    return this.executor.execute((db) => {
      db.update(messages).set(flags).where(eq(messages.id, messageId)).run();
    });
  }

  updateLabels(messageId: MessageId, labelIds: readonly LabelId[]): Promise<void> {
    return this.executor.execute((db) => {
      this.replaceLabels(db, messageId, labelIds);
    });
  }

  addLabel(messageId: MessageId, labelId: LabelId): Promise<void> {
    return this.executor.execute((db) => {
      db.insert(messageLabels).values({ messageId, labelId }).onConflictDoNothing().run();
    });
  }

  removeLabel(messageId: MessageId, labelId: LabelId): Promise<void> {
    return this.executor.execute((db) => {
      db.delete(messageLabels)
        .where(and(eq(messageLabels.messageId, messageId), eq(messageLabels.labelId, labelId)))
        .run();
    });
  }

  move(messageId: MessageId, target: MessageLocation): Promise<void> {
    return this.executor.execute((db) => {
      db.update(messages)
        .set({ mailboxId: target.mailboxId, uid: target.uid })
        .where(eq(messages.id, messageId))
        .run();
    });
  }

  deleteByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<ThreadId[]> {
    return this.executor.execute((db) => {
      const threadIds = chunked(uids).flatMap((chunk) =>
        db
          .delete(messages)
          .where(and(eq(messages.mailboxId, mailboxId), inArray(messages.uid, chunk)))
          .returning({ threadId: messages.threadId })
          .all()
          .map((row) => row.threadId),
      );
      return [...new Set(threadIds)].sort().map((threadId) => ThreadIdSchema.parse(threadId));
    });
  }

  private replaceLabels(db: RelayDb, messageId: string, labelIds: readonly string[]): void {
    db.delete(messageLabels).where(eq(messageLabels.messageId, messageId)).run();
    const unique = [...new Set(labelIds)];
    if (unique.length === 0) {
      return;
    }
    db.insert(messageLabels)
      .values(unique.map((labelId) => ({ messageId, labelId })))
      .run();
  }

  private first(db: RelayDb, rows: MessageRow[]): Message | null {
    return this.hydrate(db, rows)[0] ?? null;
  }

  private hydrate(db: RelayDb, rows: MessageRow[]): Message[] {
    const labelsByMessage = readMessageLabels(
      db,
      rows.map((row) => row.id),
    );
    return rows.map((row) => toMessage(row, labelsByMessage.get(row.id) ?? []));
  }
}
