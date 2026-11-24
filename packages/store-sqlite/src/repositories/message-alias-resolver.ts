import { eq } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messageAliases } from '../schema';

export const resolveMessageId = (db: RelayDb, messageId: string): string =>
  db
    .select({ messageId: messageAliases.messageId })
    .from(messageAliases)
    .where(eq(messageAliases.aliasId, messageId))
    .get()?.messageId ?? messageId;
