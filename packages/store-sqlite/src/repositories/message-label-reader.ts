import { asc, inArray } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { messageLabels } from '../schema';
import { chunked } from './chunked';

export const readMessageLabels = (
  db: RelayDb,
  messageIds: readonly string[],
): Map<string, string[]> => {
  const byMessage = new Map<string, string[]>();
  chunked(messageIds).forEach((chunk) => {
    db.select()
      .from(messageLabels)
      .where(inArray(messageLabels.messageId, chunk))
      .orderBy(asc(messageLabels.labelId))
      .all()
      .forEach((row) => {
        byMessage.set(row.messageId, [...(byMessage.get(row.messageId) ?? []), row.labelId]);
      });
  });
  return byMessage;
};
