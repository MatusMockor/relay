import { type AccountId, type ThreadId, ThreadIdSchema } from '@relay/shared/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messages } from '../schema';
import { chunked } from './chunked';

export const findThreadIdByReplyTo = (
  db: RelayDb,
  accountId: AccountId,
  messageIds: readonly string[],
): ThreadId | null => {
  const rows = chunked([...new Set(messageIds)]).flatMap((chunk) => {
    const row = db
      .select({ threadId: messages.threadId, dateTs: messages.dateTs, seq: messages.seq })
      .from(messages)
      .where(and(eq(messages.accountId, accountId), inArray(messages.inReplyTo, chunk)))
      .orderBy(asc(messages.dateTs), asc(messages.seq))
      .limit(1)
      .get();
    return row === undefined ? [] : [row];
  });
  const first = rows.sort((left, right) => left.dateTs - right.dateTs || left.seq - right.seq)[0];
  return first === undefined ? null : ThreadIdSchema.parse(first.threadId);
};
