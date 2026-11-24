import type { MessageLocation } from '@relay/engine';
import { type MailboxId, PENDING_UID } from '@relay/shared/domain';
import { and, asc, eq, getTableColumns, gt, inArray } from 'drizzle-orm';
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
    .where(and(eq(messagePlacements.mailboxId, mailboxId), gt(messagePlacements.uid, PENDING_UID)))
    .orderBy(asc(messagePlacements.uid))
    .all()
    .map((row) => row.uid);
