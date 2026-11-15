import { ForbiddenError, type SplitRepository } from '@relay/engine';
import type { AccountId, Split, UserId } from '@relay/shared/domain';
import { and, asc, eq, isNull, notInArray, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { splits } from '../../schema';
import { assertOwned, lockUser } from '../../support/ownership';
import { toSplit, toSplitInsert } from './split.mapper';

export class PgSplitRepository implements SplitRepository {
  constructor(private readonly db: DbExecutor) {}

  async listByUser(userId: UserId): Promise<Split[]> {
    const rows = await this.db
      .select()
      .from(splits)
      .where(eq(splits.userId, userId))
      .orderBy(asc(splits.position), asc(splits.id));
    return rows.map(toSplit);
  }

  async listForAccount(userId: UserId, accountId: AccountId): Promise<Split[]> {
    const rows = await this.db
      .select()
      .from(splits)
      .where(
        and(
          eq(splits.userId, userId),
          or(isNull(splits.accountId), eq(splits.accountId, accountId)),
        ),
      )
      .orderBy(asc(splits.position), asc(splits.id));
    return rows.map(toSplit);
  }

  async replaceAll(userId: UserId, items: readonly Split[]): Promise<Split[]> {
    if (items.some((split) => split.userId !== userId)) {
      throw new ForbiddenError('Splits must belong to the user');
    }
    return this.db.transaction(async (tx) => {
      await lockUser(tx, userId);
      for (const accountId of new Set(items.map((split) => split.accountId))) {
        await assertOwned(tx, 'Account', userId, accountId);
      }
      const keepIds = items.map((split) => split.id);
      await tx
        .delete(splits)
        .where(
          and(
            eq(splits.userId, userId),
            keepIds.length === 0 ? undefined : notInArray(splits.id, keepIds),
          ),
        );
      if (items.length > 0) {
        await tx
          .insert(splits)
          .values(items.map(toSplitInsert))
          .onConflictDoUpdate({
            target: splits.id,
            set: {
              accountId: sql`excluded.account_id`,
              name: sql`excluded.name`,
              position: sql`excluded.position`,
              rules: sql`excluded.rules`,
              exclusive: sql`excluded.exclusive`,
            },
            setWhere: eq(splits.userId, userId),
          });
      }
      return new PgSplitRepository(tx).listByUser(userId);
    });
  }
}
