import type { MessageLocation, PlacementMove } from '@relay/engine';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messagePlacements, messages } from '../schema';
import { refreshPrimaryMirror } from './primary-mirror';

export const replacePlacement = (
  db: RelayDb,
  messageId: string,
  location: MessageLocation,
): void => {
  db.delete(messagePlacements)
    .where(
      and(
        eq(messagePlacements.messageId, messageId),
        ne(messagePlacements.mailboxId, location.mailboxId),
      ),
    )
    .run();
  upsertPlacement(db, messageId, location);
};

export const upsertPlacement = (
  db: RelayDb,
  messageId: string,
  location: MessageLocation,
): void => {
  db.insert(messagePlacements)
    .values({ messageId, mailboxId: location.mailboxId, uid: location.uid })
    .onConflictDoUpdate({
      target: [messagePlacements.messageId, messagePlacements.mailboxId],
      set: { uid: location.uid },
    })
    .run();
};

const exists = (db: RelayDb, messageId: string): boolean =>
  db.select({ id: messages.id }).from(messages).where(eq(messages.id, messageId)).get() !==
  undefined;

export const movePlacementRow = (db: RelayDb, messageId: string, move: PlacementMove): void => {
  if (!exists(db, messageId)) {
    return;
  }
  if (!move.keepSource && move.from !== move.to.mailboxId) {
    db.delete(messagePlacements)
      .where(
        and(eq(messagePlacements.messageId, messageId), eq(messagePlacements.mailboxId, move.from)),
      )
      .run();
  }
  db.insert(messagePlacements)
    .values({ messageId, mailboxId: move.to.mailboxId, uid: move.to.uid })
    .onConflictDoUpdate({
      target: [messagePlacements.messageId, messagePlacements.mailboxId],
      set: {
        uid: sql`case when excluded.uid > 0 then excluded.uid else ${messagePlacements.uid} end`,
      },
    })
    .run();
  refreshPrimaryMirror(db, [messageId]);
};
