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
import { toMessageHeaders } from '../mappers/message-mapper';
import { type MessageRow, messageLabels, messages } from '../schema';
import { chunked } from './chunked';
import { listMatchSubjects } from './match-subject-query';
import { resolveMessageId } from './message-alias-resolver';
import { hydrateMessages } from './message-hydrator';
import { findRowsAtLocation, listPlacedUids } from './message-location-queries';
import { matchPlacementIn, placeMessage } from './message-placing';
import { movePlacementRow, replacePlacement } from './message-placement-writer';
import { replaceLabels, writeMessageRow } from './message-row-writer';
import { deleteAtUids, forgetMailboxPlacements, removePlacementOf } from './placement-removal';
import { findThreadIdByReplyTo } from './reply-thread-query';

export class SqliteMessageRepository implements MessageRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  findById(userId: UserId, messageId: MessageId): Promise<Message | null> {
    return this.executor.execute((db) =>
      this.first(
        db,
        db
          .select()
          .from(messages)
          .where(and(eq(messages.userId, userId), eq(messages.id, resolveMessageId(db, messageId))))
          .all(),
      ),
    );
  }

  findHeaders(userId: UserId, messageId: MessageId): Promise<MessageHeaders | null> {
    return this.executor.execute((db) => {
      const row = db
        .select({ headers: messages.headers })
        .from(messages)
        .where(and(eq(messages.userId, userId), eq(messages.id, resolveMessageId(db, messageId))))
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
    return this.executor.execute((db) => this.first(db, findRowsAtLocation(db, location)));
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

  findByEmailId(accountId: AccountId, emailId: string): Promise<Message[]> {
    return this.executor.execute((db) =>
      this.hydrate(
        db,
        db
          .select()
          .from(messages)
          .where(and(eq(messages.accountId, accountId), eq(messages.emailId, emailId)))
          .orderBy(asc(messages.dateTs), asc(messages.seq))
          .all(),
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

  findThreadIdByReplyTo(
    accountId: AccountId,
    messageIds: readonly string[],
  ): Promise<ThreadId | null> {
    return this.executor.execute((db) => findThreadIdByReplyTo(db, accountId, messageIds));
  }

  listThreadIdsByLabel(labelId: LabelId): Promise<ThreadId[]> {
    return this.executor.execute((db) =>
      db
        .selectDistinct({ threadId: messages.threadId })
        .from(messageLabels)
        .innerJoin(messages, eq(messages.id, messageLabels.messageId))
        .where(eq(messageLabels.labelId, labelId))
        .all()
        .map((row) => ThreadIdSchema.parse(row.threadId)),
    );
  }

  listUids(mailboxId: MailboxId): Promise<number[]> {
    return this.executor.execute((db) => listPlacedUids(db, mailboxId));
  }

  upsert(message: Message, headers: MessageHeaders): Promise<Message> {
    return this.executor.execute((db) => {
      writeMessageRow(db, message, headers);
      replacePlacement(db, message.id, message);
      replaceLabels(db, message.id, message.labelIds);
      return { ...message, placements: [{ mailboxId: message.mailboxId, uid: message.uid }] };
    });
  }

  listMatchSubjects(accountId: AccountId, page: PageRequest): Promise<Page<StoredMatchSubject>> {
    return this.executor.execute((db) => listMatchSubjects(db, accountId, page));
  }

  updateFlags(messageId: MessageId, flags: MessageFlags): Promise<void> {
    return this.executor.execute((db) => {
      db.update(messages)
        .set(flags)
        .where(eq(messages.id, resolveMessageId(db, messageId)))
        .run();
    });
  }

  updateLabels(messageId: MessageId, labelIds: readonly LabelId[]): Promise<void> {
    return this.executor.execute((db) => {
      replaceLabels(db, resolveMessageId(db, messageId), labelIds);
    });
  }

  addLabel(messageId: MessageId, labelId: LabelId): Promise<void> {
    return this.executor.execute((db) => {
      db.insert(messageLabels)
        .values({ messageId: resolveMessageId(db, messageId), labelId })
        .onConflictDoNothing()
        .run();
    });
  }

  removeLabel(messageId: MessageId, labelId: LabelId): Promise<void> {
    return this.executor.execute((db) => {
      const id = resolveMessageId(db, messageId);
      db.delete(messageLabels)
        .where(and(eq(messageLabels.messageId, id), eq(messageLabels.labelId, labelId)))
        .run();
    });
  }

  move(messageId: MessageId, target: MessageLocation): Promise<void> {
    return this.executor.execute((db) => {
      const id = resolveMessageId(db, messageId);
      const moved = db
        .update(messages)
        .set({ mailboxId: target.mailboxId, uid: target.uid })
        .where(eq(messages.id, id))
        .run();
      if (moved.changes === 0) {
        return;
      }
      replacePlacement(db, id, target);
    });
  }

  matchPlacement(identity: PlacementIdentity): Promise<PlacementMatch | null> {
    return this.executor.execute((db) => matchPlacementIn(db, identity));
  }

  place(request: PlaceRequest): Promise<PlaceOutcome> {
    return this.executor.execute((db) => placeMessage(db, request));
  }

  movePlacement(messageId: MessageId, move: PlacementMove): Promise<void> {
    return this.executor.execute((db) => {
      movePlacementRow(db, resolveMessageId(db, messageId), move);
    });
  }

  removePlacement(messageId: MessageId, mailboxId: MailboxId): Promise<ThreadId[]> {
    return this.executor.execute((db) =>
      removePlacementOf(db, resolveMessageId(db, messageId), mailboxId),
    );
  }

  forgetMailbox(mailboxId: MailboxId): Promise<ThreadId[]> {
    return this.executor.execute((db) => forgetMailboxPlacements(db, mailboxId));
  }

  deleteByUids(mailboxId: MailboxId, uids: readonly number[]): Promise<ThreadId[]> {
    return this.executor.execute((db) => deleteAtUids(db, mailboxId, uids));
  }

  private first(db: RelayDb, rows: MessageRow[]): Message | null {
    return this.hydrate(db, rows)[0] ?? null;
  }

  private hydrate(db: RelayDb, rows: MessageRow[]): Message[] {
    return hydrateMessages(db, rows);
  }
}
