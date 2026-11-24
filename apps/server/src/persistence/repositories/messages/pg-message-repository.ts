import {
  ConflictError,
  hasFileAttachments,
  type MessageHeaders,
  type MessageLocation,
  type MessageRepository,
  type Page,
  type PageRequest,
  type StoredMatchSubject,
  type SubjectSearchWindow,
} from '@relay/engine';
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
import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messageLabels, messages } from '../../schema';
import { findAccountOwner } from '../../support/account-owner';
import { decodeCursor, pageOf } from '../../support/cursor';
import { toIso } from '../../support/timestamps';
import { toMessageHeaders, toStoredHeaders } from './message-headers';
import { addMessageLabel, removeMessageLabel, replaceMessageLabels } from './message-labels-writer';
import { resolvedMessageId } from '../../support/message-alias';
import { deleteAtUids, findAtLocation, listPlacedUids, moveMessage } from './message-locations';
import { replacePlacement } from './message-placement-writer';
import { toMessage, toMessageInsert } from './message.mapper';
import { messageSelection } from './message-selection';
import { replyThreadCondition } from './reply-thread-condition';

export class PgMessageRepository implements MessageRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(userId: UserId, messageId: MessageId): Promise<Message | null> {
    const [row] = await this.db
      .select(messageSelection)
      .from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.id, resolvedMessageId(messageId))));
    return row === undefined ? null : toMessage(row);
  }

  async findHeaders(userId: UserId, messageId: MessageId): Promise<MessageHeaders | null> {
    const [row] = await this.db
      .select({ headers: messages.headers })
      .from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.id, resolvedMessageId(messageId))));
    return row === undefined ? null : toMessageHeaders(row.headers);
  }

  async listByThread(userId: UserId, threadId: ThreadId): Promise<Message[]> {
    const rows = await this.db
      .select(messageSelection)
      .from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.threadId, threadId)))
      .orderBy(asc(messages.date), asc(messages.id));
    return rows.map(toMessage);
  }

  findByLocation(location: MessageLocation): Promise<Message | null> {
    return findAtLocation(this.db, location);
  }

  async findByMessageIdHeaders(
    accountId: AccountId,
    headers: readonly string[],
  ): Promise<Message[]> {
    if (headers.length === 0) {
      return [];
    }
    const rows = await this.db
      .select(messageSelection)
      .from(messages)
      .where(
        and(eq(messages.accountId, accountId), inArray(messages.messageIdHeader, [...headers])),
      )
      .orderBy(asc(messages.date), asc(messages.id));
    return rows.map(toMessage);
  }

  async findByEmailId(accountId: AccountId, emailId: string): Promise<Message[]> {
    const rows = await this.db
      .select(messageSelection)
      .from(messages)
      .where(and(eq(messages.accountId, accountId), eq(messages.emailId, emailId)))
      .orderBy(asc(messages.date), asc(messages.id));
    return rows.map(toMessage);
  }

  async findThreadIdBySubject(
    accountId: AccountId,
    normalizedSubject: string,
    window: SubjectSearchWindow,
  ): Promise<ThreadId | null> {
    const [row] = await this.db
      .select({ threadId: messages.threadId })
      .from(messages)
      .where(
        and(
          eq(messages.accountId, accountId),
          sql`md5(${messages.normalizedSubject}) = md5(${normalizedSubject})`,
          eq(messages.normalizedSubject, normalizedSubject),
          gte(messages.date, window.since),
          lte(messages.date, window.until),
        ),
      )
      .orderBy(desc(messages.date), desc(messages.id))
      .limit(1);
    return row?.threadId ?? null;
  }

  async findThreadIdByReplyTo(
    accountId: AccountId,
    messageIds: readonly string[],
  ): Promise<ThreadId | null> {
    if (messageIds.length === 0) {
      return null;
    }
    const [row] = await this.db
      .select({ threadId: messages.threadId })
      .from(messages)
      .where(and(eq(messages.accountId, accountId), replyThreadCondition(messageIds)))
      .orderBy(asc(messages.date), asc(messages.id))
      .limit(1);
    return row?.threadId ?? null;
  }

  async listThreadIdsByLabel(labelId: LabelId): Promise<ThreadId[]> {
    const rows = await this.db
      .selectDistinct({ threadId: messages.threadId })
      .from(messageLabels)
      .innerJoin(messages, eq(messages.id, messageLabels.messageId))
      .where(eq(messageLabels.labelId, labelId));
    return rows.map((row) => row.threadId);
  }

  listUids(mailboxId: MailboxId): Promise<number[]> {
    return listPlacedUids(this.db, mailboxId);
  }

  async upsert(message: Message, headers: MessageHeaders): Promise<Message> {
    return this.db.transaction(async (tx) => {
      const userId = await findAccountOwner(tx, message.accountId);
      const {
        id: _id,
        userId: _userId,
        ...changes
      } = toMessageInsert(userId, message, toStoredHeaders(headers));
      const written = await tx
        .insert(messages)
        .values({ ...changes, id: message.id, userId })
        .onConflictDoUpdate({
          target: messages.id,
          set: changes,
          setWhere: eq(messages.userId, userId),
        })
        .returning({ id: messages.id });
      if (written.length === 0) {
        throw new ConflictError(`Message ${message.id} belongs to another user`);
      }
      await replacePlacement(tx, message.id, message);
      await replaceMessageLabels(tx, message.id, message.labelIds);
      const stored = await new PgMessageRepository(tx).findById(userId, message.id);
      return stored ?? message;
    });
  }

  async listMatchSubjects(
    accountId: AccountId,
    page: PageRequest,
  ): Promise<Page<StoredMatchSubject>> {
    const cursor = decodeCursor(page.cursor);
    const rows = await this.db
      .select({
        id: messages.id,
        threadId: messages.threadId,
        date: messages.date,
        from: messages.from,
        subject: messages.subject,
        headers: messages.headers,
        to: messages.to,
        cc: messages.cc,
        attachments: messages.attachments,
      })
      .from(messages)
      .where(
        and(
          eq(messages.accountId, accountId),
          cursor === null
            ? undefined
            : sql`(${messages.date}, ${messages.id}) > (${cursor.t}::timestamptz, ${cursor.id})`,
        ),
      )
      .orderBy(asc(messages.date), asc(messages.id))
      .limit(page.limit + 1);
    const result = pageOf(rows, page.limit, (row) => ({ t: toIso(row.date), id: row.id }));
    return {
      nextCursor: result.nextCursor,
      items: result.items.map((row) => ({
        messageId: row.id,
        threadId: row.threadId,
        subject: {
          from: row.from,
          subject: row.subject,
          headers: toMessageHeaders(row.headers),
          to: row.to,
          cc: row.cc,
          hasAttachments: hasFileAttachments(row.attachments),
        },
      })),
    };
  }

  async updateFlags(messageId: MessageId, flags: MessageFlags): Promise<void> {
    await this.db
      .update(messages)
      .set({ seen: flags.seen, flagged: flags.flagged, answered: flags.answered })
      .where(eq(messages.id, resolvedMessageId(messageId)));
  }

  async updateLabels(messageId: MessageId, labelIds: readonly LabelId[]): Promise<void> {
    await this.db.transaction((tx) => replaceMessageLabels(tx, messageId, labelIds));
  }

  async addLabel(messageId: MessageId, labelId: LabelId): Promise<void> {
    await addMessageLabel(this.db, messageId, labelId);
  }

  async removeLabel(messageId: MessageId, labelId: LabelId): Promise<void> {
    await removeMessageLabel(this.db, messageId, labelId);
  }

  move(messageId: MessageId, target: MessageLocation): Promise<void> {
    return moveMessage(this.db, messageId, target);
  }

  deleteByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<ThreadId[]> {
    return deleteAtUids(this.db, mailboxId, uids);
  }
}
