import { isNull, or, type SQL, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { toDate } from './timestamps';

export const leaseStaleBefore = (
  claimedAt: PgColumn,
  renewedAt: PgColumn,
  staleBefore: string,
): SQL =>
  or(isNull(claimedAt), sql`coalesce(${renewedAt}, ${claimedAt}) < ${toDate(staleBefore)}`) as SQL;
