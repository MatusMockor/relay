import type { AccountId } from '@relay/shared/domain';
import { type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import { messages } from '../../../schema';
import { lockMessagesWhere } from '../message-row-locks';

export const emailIdIn = (emailIds: readonly string[]): SQL =>
  sql`${messages.emailId} = any(${sql.param([...emailIds])}::text[])`;

export const lockMergeGroups = async (
  db: DbExecutor,
  accountId: AccountId,
  emailIds: readonly string[],
): Promise<void> => {
  const keys = [...emailIds].sort().map((emailId) => `relay:email:${accountId}:${emailId}`);
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(key, 0)) from unnest(${sql.param(keys)}::text[]) as key`,
  );
  await lockMessagesWhere(db, sql`${messages.accountId} = ${accountId} and ${emailIdIn(emailIds)}`);
};
