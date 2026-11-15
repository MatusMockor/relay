import { NotFoundError } from '@relay/engine';
import { type AccountId, type UserId, UserIdSchema } from '@relay/shared/domain';
import { eq } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import { accounts } from '../schema';

export const accountOwnerOf = (db: RelayDb, accountId: AccountId): UserId => {
  const row = db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  if (row === undefined) {
    throw new NotFoundError('Account', accountId);
  }
  return UserIdSchema.parse(row.userId);
};
