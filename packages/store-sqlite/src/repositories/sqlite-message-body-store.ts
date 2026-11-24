import type { HydratedBody, HydrationCandidate, MessageBodyStore } from '@relay/engine';
import {
  type AccountId,
  AttachmentMetaSchema,
  MailboxIdSchema,
  type MessageId,
  MessageIdSchema,
  type OfflineStats,
  ThreadIdSchema,
} from '@relay/shared/domain';
import { and, asc, count, desc, eq, gt, gte, inArray, lt, max, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { messagePlacements, messages } from '../schema';
import { placedWithKnownUid } from './placement-conditions';

const PENDING_UID = 0;
const AttachmentsSchema = z.array(AttachmentMetaSchema);

const remoteSince = (accountId: AccountId, since: Date | null, excluding: readonly MessageId[]) =>
  and(
    eq(messages.accountId, accountId),
    eq(messages.bodyState, 'remote'),
    since === null ? undefined : gte(messages.dateTs, since.getTime()),
    gt(messagePlacements.uid, PENDING_UID),
    excluding.length === 0 ? undefined : notInArray(messages.id, [...excluding]),
  );

export class SqliteMessageBodyStore implements MessageBodyStore {
  constructor(private readonly executor: SqliteExecutor) {}

  saveBody(messageId: MessageId, body: HydratedBody): Promise<boolean> {
    return this.executor.execute(
      (db) =>
        db
          .update(messages)
          .set({
            textBody: body.textBody,
            htmlBody: body.htmlBody,
            snippet: body.snippet,
            attachments: [...body.attachments],
            bodyState: 'local',
          })
          .where(and(eq(messages.id, messageId), eq(messages.bodyState, 'remote')))
          .run().changes > 0,
    );
  }

  evictBefore(accountId: AccountId, before: Date, limit: number): Promise<number> {
    return this.executor.execute((db) => {
      const due = db
        .select({ seq: messages.seq })
        .from(messages)
        .where(
          and(
            eq(messages.accountId, accountId),
            eq(messages.bodyState, 'local'),
            lt(messages.dateTs, before.getTime()),
            placedWithKnownUid,
          ),
        )
        .orderBy(asc(messages.dateTs))
        .limit(limit);
      return db
        .update(messages)
        .set({ textBody: null, htmlBody: null, bodyState: 'remote' })
        .where(inArray(messages.seq, due))
        .run().changes;
    });
  }

  hydrationCandidates(
    accountId: AccountId,
    since: Date | null,
    limit: number,
    excluding: readonly MessageId[],
  ): Promise<HydrationCandidate[]> {
    return this.executor.execute((db) =>
      db
        .select({
          id: messages.id,
          threadId: messages.threadId,
          mailboxId: messagePlacements.mailboxId,
          uid: messagePlacements.uid,
          messageIdHeader: messages.messageIdHeader,
          snippet: messages.snippet,
          attachments: messages.attachments,
        })
        .from(messages)
        .innerJoin(messagePlacements, eq(messagePlacements.messageId, messages.id))
        .where(remoteSince(accountId, since, excluding))
        .orderBy(desc(messages.dateTs), desc(messages.seq))
        .limit(limit)
        .all()
        .map((row) => ({
          messageId: MessageIdSchema.parse(row.id),
          threadId: ThreadIdSchema.parse(row.threadId),
          mailboxId: MailboxIdSchema.parse(row.mailboxId),
          uid: row.uid,
          messageIdHeader: row.messageIdHeader,
          snippet: row.snippet,
          attachments: AttachmentsSchema.parse(row.attachments),
        })),
    );
  }

  stats(accountId: AccountId): Promise<OfflineStats> {
    return this.executor.execute((db) => {
      const rows = db
        .select({ state: messages.bodyState, total: count() })
        .from(messages)
        .where(eq(messages.accountId, accountId))
        .groupBy(messages.bodyState)
        .all();
      const totalOf = (state: 'local' | 'remote') =>
        rows.find((row) => row.state === state)?.total ?? 0;
      return { local: totalOf('local'), remote: totalOf('remote') };
    });
  }

  newestRemoteDate(accountId: AccountId): Promise<Date | null> {
    return this.executor.execute((db) => {
      const row = db
        .select({ newest: max(messages.dateTs) })
        .from(messages)
        .where(and(eq(messages.accountId, accountId), eq(messages.bodyState, 'remote')))
        .get();
      const newest = row?.newest ?? null;
      return newest === null ? null : new Date(newest);
    });
  }
}
