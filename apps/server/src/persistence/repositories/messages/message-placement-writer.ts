import type { MessageLocation } from '@relay/engine';
import type { MessageId } from '@relay/shared/domain';
import { and, eq, ne } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { messagePlacements } from '../../schema';

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
  await db
    .insert(messagePlacements)
    .values({ messageId, mailboxId: location.mailboxId, uid: location.uid })
    .onConflictDoUpdate({
      target: [messagePlacements.messageId, messagePlacements.mailboxId],
      set: { uid: location.uid },
    });
};
