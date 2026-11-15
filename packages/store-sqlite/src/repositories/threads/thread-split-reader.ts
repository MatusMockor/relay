import { asc, inArray } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';
import { threadSplits } from '../../schema';
import { chunked } from '../chunked';

export const readThreadSplits = (
  db: RelayDb,
  threadIds: readonly string[],
): Map<string, string[]> => {
  const byThread = new Map<string, string[]>();
  chunked(threadIds).forEach((chunk) => {
    db.select()
      .from(threadSplits)
      .where(inArray(threadSplits.threadId, chunk))
      .orderBy(asc(threadSplits.splitId))
      .all()
      .forEach((row) => {
        byThread.set(row.threadId, [...(byThread.get(row.threadId) ?? []), row.splitId]);
      });
  });
  return byThread;
};
