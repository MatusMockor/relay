import { ConflictError, ForbiddenError, type SplitRepository } from '@relay/engine';
import type { AccountId, Split, SplitId, UserId } from '@relay/shared/domain';
import { and, asc, eq, inArray, isNull, ne, notInArray, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { splits } from '../../schema';
import { assertOwned, lockUser } from '../../support/ownership';
import { toSplit, toSplitInsert } from './split.mapper';

const assertIdsAvailable = async (
  db: DbExecutor,
  userId: UserId,
  splitIds: readonly SplitId[],
): Promise<void> => {
  if (splitIds.length === 0) {
    return;
  }
  const [taken] = await db
    .select({ id: splits.id })
    .from(splits)
    .where(and(inArray(splits.id, [...splitIds]), ne(splits.userId, userId)))
    .limit(1);
  if (taken !== undefined) {
    throw new ConflictError(`Split ${taken.id} is already in use`);
  }
};

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
      await assertIdsAvailable(tx, userId, keepIds);
      await tx
        .delete(splits)
        .where(
          and(
            eq(splits.userId, userId),
            keepIds.length === 0 ? undefined : notInArray(splits.id, keepIds),
          ),
        );
      if (items.length > 0) {
        const written = await tx
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
              hideTasks: sql`excluded.hide_tasks`,
            },
            setWhere: eq(splits.userId, userId),
          })
          .returning({ id: splits.id });
        if (written.length < new Set(keepIds).size) {
          throw new ConflictError('A split id is already in use');
        }
      }
      return new PgSplitRepository(tx).listByUser(userId);
    });
  }
}
