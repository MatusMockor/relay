import { type MailboxId, type MessageId, PENDING_UID, type ThreadId } from '@relay/shared/domain';
import type { PlacementRemoval } from '@relay/engine';
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messagePlacements, messages } from '../../schema';
import { resolvedMessageId } from '../../support/message-alias';
import { idIn, lockMessages, lockMessagesWhere } from './message-row-locks';
import { retargetReplyDrafts } from '../drafts/reply-draft-retarget';
import { refreshPrimaryMirror } from './primary-mirror';

const UNPLACED = sql`not exists (select 1 from ${messagePlacements} where ${messagePlacements.messageId} = ${messages.id})`;

const threadIdsOf = async (db: DbExecutor, messageIds: readonly string[]): Promise<ThreadId[]> => {
  const rows = await db
    .selectDistinct({ threadId: messages.threadId })
    .from(messages)
    .where(idIn(messageIds));
  return rows.map((row) => row.threadId);
};

const dropPlacements = (db: DbExecutor, where: SQL | undefined): Promise<ThreadId[]> =>
  db.transaction(async (tx) => {
    const locked = await lockMessagesWhere(
      tx,
      inArray(
        messages.id,
        tx.select({ id: messagePlacements.messageId }).from(messagePlacements).where(where),
      ),
    );
    const dropped = await tx
      .delete(messagePlacements)
      .where(where)
      .returning({ messageId: messagePlacements.messageId });
    const messageIds = [...new Set(dropped.map((row) => row.messageId))];
    if (messageIds.length === 0) {
      return [];
    }
    const held = new Set<string>(locked);
    await lockMessages(
      tx,
      messageIds.filter((id) => !held.has(id)),
    );
    const threadIds = await threadIdsOf(tx, messageIds);
    await refreshPrimaryMirror(tx, messageIds);
    await tx.delete(messages).where(and(idIn(messageIds), UNPLACED));
    return [...new Set(threadIds)].sort();
  });

export const deleteAtUids = (
  db: DbExecutor,
  mailboxId: MailboxId,
  uids: readonly number[],
): Promise<ThreadId[]> => {
  const known = [...new Set(uids.filter((uid) => uid > PENDING_UID))];
  if (known.length === 0) {
    return Promise.resolve([]);
  }
  return dropPlacements(
    db,
    and(
      eq(messagePlacements.mailboxId, mailboxId),
      sql`${messagePlacements.uid} = any(${sql.param(known)}::bigint[])`,
    ),
  );
};

const retires = async (db: DbExecutor, messageId: MessageId, mailboxId: MailboxId) => {
  const rows = await db
    .select({ mailboxId: messagePlacements.mailboxId })
    .from(messagePlacements)
    .where(eq(messagePlacements.messageId, messageId));
  return (
    rows.some((row) => row.mailboxId === mailboxId) &&
    rows.every((row) => row.mailboxId === mailboxId)
  );
};

export const removePlacementOf = (
  db: DbExecutor,
  messageId: MessageId,
  mailboxId: MailboxId,
  successor: MessageId | null,
): Promise<PlacementRemoval> =>
  db.transaction(async (tx) => {
    const [locked] = await lockMessagesWhere(tx, eq(messages.id, resolvedMessageId(messageId)));
    if (locked === undefined) {
      return { threadIds: [], retired: false };
    }
    const retired = await retires(tx, locked, mailboxId);
    if (retired && successor !== null) {
      await retargetReplyDrafts(tx, locked, successor);
    }
    const threadIds = await dropPlacements(
      tx,
      and(eq(messagePlacements.messageId, locked), eq(messagePlacements.mailboxId, mailboxId)),
    );
    return { threadIds, retired };
  });

export const forgetMailboxPlacements = (
  db: DbExecutor,
  mailboxId: MailboxId,
): Promise<ThreadId[]> => dropPlacements(db, eq(messagePlacements.mailboxId, mailboxId));
