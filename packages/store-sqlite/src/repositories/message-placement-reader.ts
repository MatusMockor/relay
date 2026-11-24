import type { MessagePlacement } from '@relay/shared/domain';
import { MailboxIdSchema } from '@relay/shared/domain';
import { asc, inArray } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messagePlacements } from '../schema';
import { chunked } from './chunked';

export const readMessagePlacements = (
  db: RelayDb,
  messageIds: readonly string[],
): Map<string, MessagePlacement[]> => {
  const byMessage = new Map<string, MessagePlacement[]>();
  chunked(messageIds).forEach((chunk) => {
    db.select()
      .from(messagePlacements)
      .where(inArray(messagePlacements.messageId, chunk))
      .orderBy(asc(messagePlacements.mailboxId))
      .all()
      .forEach((row) => {
        const placement = { mailboxId: MailboxIdSchema.parse(row.mailboxId), uid: row.uid };
        byMessage.set(row.messageId, [...(byMessage.get(row.messageId) ?? []), placement]);
      });
  });
  return byMessage;
};
