import type { MergeChunk, MergeGroup } from '@relay/engine';
import { sql } from 'drizzle-orm';
import type { RelayDb } from '../../database/sqlite-database';

const accumulate = (candidates: readonly MergeGroup[], maxMessages: number): MergeGroup[] => {
  const taken: MergeGroup[] = [];
  let total = 0;
  for (const group of candidates) {
    if (taken.length > 0 && total + group.size > maxMessages) {
      break;
    }
    taken.push(group);
    total += group.size;
  }
  return taken;
};

export const readNextGroups = (
  db: RelayDb,
  accountId: string,
  after: string | null,
  maxMessages: number,
): MergeChunk => {
  const limit = Math.max(1, Math.floor(maxMessages / 2));
  const candidates = db.all<MergeGroup>(sql`
    select email_id as emailId, count(*) as size from messages
    where account_id = ${accountId} and email_id is not null and email_id > ${after ?? ''}
    group by email_id having count(*) > 1
    order by email_id limit ${limit}
  `);
  const groups = accumulate(candidates, maxMessages);
  return { groups, last: groups.at(-1)?.emailId ?? null };
};
