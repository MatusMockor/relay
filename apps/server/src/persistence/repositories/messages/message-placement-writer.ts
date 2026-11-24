import type { MessageLocation, PlacementMove } from '@relay/engine';
import type { MessageId } from '@relay/shared/domain';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messagePlacements } from '../../schema';
import { lockResolvedMessage } from './message-row-locks';
import { refreshPrimaryMirror } from './primary-mirror';

export const upsertPlacement = async (
  db: DbExecutor,
  messageId: MessageId,
  location: MessageLocation,
): Promise<void> => {
  await db
    .insert(messagePlacements)
    .values({ messageId, mailboxId: location.mailboxId, uid: location.uid })
    .onConflictDoUpdate({
      target: [messagePlacements.messageId, messagePlacements.mailboxId],
      set: { uid: location.uid },
    });
};

export const replacePlacement = async (
  db: DbExecutor,
  messageId: MessageId,
  location: MessageLocation,
): Promise<void> => {
  await db
    .delete(messagePlacements)
    .where(
      and(
        eq(messagePlacements.messageId, messageId),
        ne(messagePlacements.mailboxId, location.mailboxId),
      ),
    );
  await upsertPlacement(db, messageId, location);
};

export const movePlacementRow = async (
  db: DbExecutor,
  messageId: MessageId,
  move: PlacementMove,
): Promise<void> => {
  const id = await lockResolvedMessage(db, messageId);
  if (id === undefined) {
    return;
  }
  if (!move.keepSource && move.from !== move.to.mailboxId) {
    await db
      .delete(messagePlacements)
      .where(and(eq(messagePlacements.messageId, id), eq(messagePlacements.mailboxId, move.from)));
  }
  await db
    .insert(messagePlacements)
    .values({ messageId: id, mailboxId: move.to.mailboxId, uid: move.to.uid })
    .onConflictDoUpdate({
      target: [messagePlacements.messageId, messagePlacements.mailboxId],
      set: {
        uid: sql`case when excluded.uid > 0 then excluded.uid else ${messagePlacements.uid} end`,
      },
    });
  await refreshPrimaryMirror(db, [id]);
};
