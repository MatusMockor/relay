import { isNull, or, type SQL, sql } from 'drizzle-orm';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { toTimestamp } from '../mappers/timestamp';

export const leaseStaleBefore = (
  claimedTs: SQLiteColumn,
  renewedTs: SQLiteColumn,
  staleBefore: string,
): SQL =>
  or(
    isNull(claimedTs),
    sql`coalesce(${renewedTs}, ${claimedTs}) < ${toTimestamp(staleBefore)}`,
  ) as SQL;
