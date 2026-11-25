import type { AccountId, UserId } from '@relay/shared/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { mailAccounts } from '../../schema';
import { lockUserAccounts } from '../../support/ownership';

export const IN_ACCOUNT_ORDER = [
  asc(mailAccounts.sortOrder),
  asc(mailAccounts.createdAt),
  asc(mailAccounts.id),
];

export const nextAccountPosition = (userId: UserId) =>
  sql<number>`(select coalesce(max(${mailAccounts.sortOrder}), -1) + 1 from ${mailAccounts} where ${mailAccounts.userId} = ${userId})`;

export const lockAccountsOf = async (db: DbExecutor, userId: UserId) => {
  await lockUserAccounts(db, userId);
  return db
    .select()
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, userId))
    .orderBy(...IN_ACCOUNT_ORDER)
    .for('no key update');
};

export const writeAccountPositions = (
  db: DbExecutor,
  userId: UserId,
  orderedIds: readonly AccountId[],
): Promise<number> =>
  db.transaction(async (tx) => {
    await lockUserAccounts(tx, userId);
    let written = 0;
    for (const [position, accountId] of orderedIds.entries()) {
      const rows = await tx
        .update(mailAccounts)
        .set({ sortOrder: position })
        .where(and(eq(mailAccounts.userId, userId), eq(mailAccounts.id, accountId)))
        .returning({ id: mailAccounts.id });
      written += rows.length;
    }
    return written;
  });
