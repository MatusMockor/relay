import type { MessageLocation } from '@relay/engine';
import { and, eq, ne } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messagePlacements } from '../schema';

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
  db.insert(messagePlacements)
    .values({ messageId, mailboxId: location.mailboxId, uid: location.uid })
    .onConflictDoUpdate({
      target: [messagePlacements.messageId, messagePlacements.mailboxId],
      set: { uid: location.uid },
    })
    .run();
};
