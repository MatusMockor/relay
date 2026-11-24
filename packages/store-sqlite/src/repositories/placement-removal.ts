import { type MailboxId, PENDING_UID, type ThreadId, ThreadIdSchema } from '@relay/shared/domain';
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messagePlacements, messages } from '../schema';
import { chunked } from './chunked';
import { refreshPrimaryMirror } from './primary-mirror';

const UNPLACED = sql`not exists (select 1 from ${messagePlacements} where ${messagePlacements.messageId} = ${messages.id})`;

const threadIdsOf = (db: RelayDb, messageIds: readonly string[]): string[] =>
  chunked(messageIds).flatMap((chunk) =>
    db
      .selectDistinct({ threadId: messages.threadId })
      .from(messages)
      .where(inArray(messages.id, chunk))
      .all()
      .map((row) => row.threadId),
  );

const sortedThreadIds = (threadIds: readonly string[]): ThreadId[] =>
  [...new Set(threadIds)].sort().map((threadId) => ThreadIdSchema.parse(threadId));

const dropPlacements = (db: RelayDb, where: SQL | undefined): string[] => {
  const messageIds = [
    ...new Set(
      db
        .select({ messageId: messagePlacements.messageId })
        .from(messagePlacements)
        .where(where)
        .all()
        .map((row) => row.messageId),
    ),
  ];
  if (messageIds.length === 0) {
    return [];
  }
  const threadIds = threadIdsOf(db, messageIds);
  db.delete(messagePlacements).where(where).run();
  refreshPrimaryMirror(db, messageIds);
  chunked(messageIds).forEach((chunk) => {
    db.delete(messages)
      .where(and(inArray(messages.id, chunk), UNPLACED))
      .run();
  });
  return threadIds;
};

export const deleteAtUids = (
  db: RelayDb,
  mailboxId: MailboxId,
  uids: readonly number[],
): ThreadId[] => {
  const known = [...new Set(uids.filter((uid) => uid > PENDING_UID))];
  return sortedThreadIds(
    chunked(known).flatMap((chunk) =>
      dropPlacements(
        db,
        and(eq(messagePlacements.mailboxId, mailboxId), inArray(messagePlacements.uid, chunk)),
      ),
    ),
  );
};

export const removePlacementOf = (
  db: RelayDb,
  messageId: string,
  mailboxId: MailboxId,
): ThreadId[] =>
  sortedThreadIds(
    dropPlacements(
      db,
      and(eq(messagePlacements.messageId, messageId), eq(messagePlacements.mailboxId, mailboxId)),
    ),
  );

export const forgetMailboxPlacements = (db: RelayDb, mailboxId: MailboxId): ThreadId[] =>
  sortedThreadIds(dropPlacements(db, eq(messagePlacements.mailboxId, mailboxId)));
