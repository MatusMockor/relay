import { type SQL, sql } from 'drizzle-orm';
import { messageAliases } from '../schema';

export const resolvedMessageId = (messageId: string): SQL =>
  sql`coalesce((select ${messageAliases.messageId} from ${messageAliases} where ${messageAliases.aliasId} = ${messageId}), ${messageId})`;
