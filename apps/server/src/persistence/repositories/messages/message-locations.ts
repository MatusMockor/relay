import type { MessageLocation } from '@relay/engine';
import { type MailboxId, type Message, type MessageId, PENDING_UID } from '@relay/shared/domain';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messagePlacements, messages } from '../../schema';
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

export const findStoredMessage = async (
  db: DbExecutor,
  messageId: MessageId,
): Promise<Message | null> => {
  const [row] = await db.select(messageSelection).from(messages).where(eq(messages.id, messageId));
  return row === undefined ? null : toMessage(row);
};

export const listPlacedUids = async (db: DbExecutor, mailboxId: MailboxId): Promise<number[]> => {
  const rows = await db
    .select({ uid: messagePlacements.uid })
    .from(messagePlacements)
    .where(and(eq(messagePlacements.mailboxId, mailboxId), gt(messagePlacements.uid, PENDING_UID)))
    .orderBy(asc(messagePlacements.uid));
  return rows.map((row) => row.uid);
};
