import type { MergeChunk, MergeGroup } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import { messages } from '../../../schema';

const EMAIL_ID_BYTES = sql`${messages.emailId} collate "C"`;

interface GroupRow {
  readonly emailId: string | null;
  readonly size: number;
}

const takeWithin = (rows: readonly GroupRow[], maxMessages: number): MergeGroup[] => {
  const taken: MergeGroup[] = [];
  let total = 0;
  for (const row of rows) {
    if (row.emailId === null || (taken.length > 0 && total + row.size > maxMessages)) {
      return taken;
    }
    taken.push({ emailId: row.emailId, size: row.size });
    total += row.size;
  }
  return taken;
};

export const nextMergeGroups = async (
  db: DbExecutor,
  accountId: AccountId,
  after: string | null,
  maxMessages: number,
): Promise<MergeChunk> => {
  const rows = await db
    .select({ emailId: sql<string | null>`${EMAIL_ID_BYTES}`, size: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, accountId),
        isNotNull(messages.emailId),
        after === null ? undefined : sql`${EMAIL_ID_BYTES} > ${after}`,
      ),
    )
    .groupBy(EMAIL_ID_BYTES)
    .having(sql`count(*) > 1`)
    .orderBy(asc(EMAIL_ID_BYTES))
    .limit(Math.floor(Math.max(maxMessages, 2) / 2) + 1);
  const groups = takeWithin(rows, maxMessages);
  return { groups, last: groups.at(-1)?.emailId ?? null };
};
