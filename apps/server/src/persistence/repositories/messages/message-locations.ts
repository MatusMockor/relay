import type { MessageLocation } from '@relay/engine';
import type { MailboxId, Message, MessageId, ThreadId } from '@relay/shared/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messagePlacements, messages } from '../../schema';
import { resolvedMessageId } from '../../support/message-alias';
import { replacePlacement } from './message-placement-writer';
import { messageSelection } from './message-selection';
import { toMessage } from './message.mapper';

export const findAtLocation = async (
  db: DbExecutor,
  location: MessageLocation,
): Promise<Message | null> => {
  const [row] = await db
    .select(messageSelection)
    .from(messagePlacements)
    .innerJoin(messages, eq(messages.id, messagePlacements.messageId))
    .where(
      and(
        eq(messagePlacements.mailboxId, location.mailboxId),
        eq(messagePlacements.uid, location.uid),
      ),
    );
  return row === undefined ? null : toMessage(row);
};

export const listPlacedUids = async (db: DbExecutor, mailboxId: MailboxId): Promise<number[]> => {
  const rows = await db
    .select({ uid: messagePlacements.uid })
    .from(messagePlacements)
    .where(eq(messagePlacements.mailboxId, mailboxId))
    .orderBy(asc(messagePlacements.uid));
  return rows.map((row) => row.uid);
};

export const moveMessage = (
  db: DbExecutor,
  messageId: MessageId,
  target: MessageLocation,
): Promise<void> =>
  db.transaction(async (tx) => {
    const moved = await tx
      .update(messages)
      .set({ mailboxId: target.mailboxId, uid: target.uid })
      .where(eq(messages.id, resolvedMessageId(messageId)))
      .returning({ id: messages.id });
    const [row] = moved;
    if (row === undefined) {
      return;
    }
    await replacePlacement(tx, row.id, target);
  });

export const deleteAtUids = async (
  db: DbExecutor,
  mailboxId: MailboxId,
  uids: readonly number[],
): Promise<ThreadId[]> => {
  if (uids.length === 0) {
    return [];
  }
  const placed = db
    .select({ id: messagePlacements.messageId })
    .from(messagePlacements)
    .where(
      and(eq(messagePlacements.mailboxId, mailboxId), inArray(messagePlacements.uid, [...uids])),
    );
  const rows = await db
    .delete(messages)
    .where(
      and(
        inArray(messages.id, placed),
        eq(messages.mailboxId, mailboxId),
        inArray(messages.uid, [...uids]),
      ),
    )
    .returning({ threadId: messages.threadId });
  return [...new Set(rows.map((row) => row.threadId))];
};
