import { NotFoundError } from '@relay/engine';
import type { AccountId, UserId } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../database/database';
import { mailAccounts } from '../schema';

export const findAccountOwner = async (db: DbExecutor, accountId: AccountId): Promise<UserId> => {
  const [row] = await db
    .select({ userId: mailAccounts.userId })
    .from(mailAccounts)
    .where(eq(mailAccounts.id, accountId));
  if (row === undefined) {
    throw new NotFoundError('Account', accountId);
  }
  return row.userId;
};
