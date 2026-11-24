import type { MessageLocation } from '@relay/engine';
import type { MailboxId, ThreadId } from '@relay/shared/domain';
import { ThreadIdSchema } from '@relay/shared/domain';
import { and, asc, eq, getTableColumns, inArray } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { type MessageRow, messagePlacements, messages } from '../schema';
import { chunked } from './chunked';

const placedMessages = (db: RelayDb) =>
  db
    .select(getTableColumns(messages))
    .from(messagePlacements)
    .innerJoin(messages, eq(messages.id, messagePlacements.messageId));

export const findRowsAtLocation = (db: RelayDb, location: MessageLocation): MessageRow[] =>
  placedMessages(db)
    .where(
      and(
        eq(messagePlacements.mailboxId, location.mailboxId),
        eq(messagePlacements.uid, location.uid),
      ),
    )
    .all();

export const findRowsAtUids = (
  db: RelayDb,
  mailboxId: MailboxId,
  uids: readonly number[],
): MessageRow[] =>
  chunked([...new Set(uids)]).flatMap((chunk) =>
    placedMessages(db)
      .where(and(eq(messagePlacements.mailboxId, mailboxId), inArray(messagePlacements.uid, chunk)))
      .orderBy(asc(messagePlacements.uid))
      .all(),
  );

export const listPlacedUids = (db: RelayDb, mailboxId: MailboxId): number[] =>
  db
    .select({ uid: messagePlacements.uid })
    .from(messagePlacements)
    .where(eq(messagePlacements.mailboxId, mailboxId))
    .orderBy(asc(messagePlacements.uid))
    .all()
    .map((row) => row.uid);

export const deleteRowsAtUids = (
  db: RelayDb,
  mailboxId: MailboxId,
  uids: readonly number[],
): ThreadId[] => {
  const threadIds = chunked(uids).flatMap((chunk) =>
    db
      .delete(messages)
      .where(
        inArray(
          messages.id,
          db
            .select({ id: messagePlacements.messageId })
            .from(messagePlacements)
            .where(
              and(
                eq(messagePlacements.mailboxId, mailboxId),
                inArray(messagePlacements.uid, chunk),
              ),
            ),
        ),
      )
      .returning({ threadId: messages.threadId })
      .all()
      .map((row) => row.threadId),
  );
  return [...new Set(threadIds)].sort().map((threadId) => ThreadIdSchema.parse(threadId));
};
