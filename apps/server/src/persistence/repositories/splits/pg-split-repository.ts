import { ConflictError, ForbiddenError, type KeptSplit, type SplitRepository } from '@relay/engine';
import {
  type AccountId,
  isUnsupportedSplit,
  type Split,
  type SplitEntry,
  type SplitId,
  supportedSplits,
  type UnsupportedSplit,
  type UserId,
} from '@relay/shared/domain';
import { and, asc, eq, inArray, isNull, ne, notInArray, or, type SQL, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { splits } from '../../schema';
import { assertOwned, lockUser } from '../../support/ownership';
import { toSplitEntry, toSplitInsert } from './split.mapper';

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
    return supportedSplits(await this.entries(eq(splits.userId, userId)));
  }

  async listUnsupported(userId: UserId): Promise<UnsupportedSplit[]> {
    return (await this.entries(eq(splits.userId, userId))).filter(isUnsupportedSplit);
  }

  async listForAccount(userId: UserId, accountId: AccountId): Promise<Split[]> {
    return supportedSplits(
      await this.entries(
        and(
          eq(splits.userId, userId),
          or(isNull(splits.accountId), eq(splits.accountId, accountId)),
        ),
      ),
    );
  }

  async replaceAll(
    userId: UserId,
    items: readonly Split[],
    keep: readonly KeptSplit[] = [],
  ): Promise<Split[]> {
    if (items.some((split) => split.userId !== userId)) {
      throw new ForbiddenError('Splits must belong to the user');
    }
    return this.db.transaction(async (tx) => {
      await lockUser(tx, userId);
      for (const accountId of new Set(items.map((split) => split.accountId))) {
        await assertOwned(tx, 'Account', userId, accountId);
      }
      const written = items.map((split) => split.id);
      const keepIds = [...written, ...keep.map(({ id }) => id)];
      await assertIdsAvailable(tx, userId, written);
      await tx
        .delete(splits)
        .where(
          and(
            eq(splits.userId, userId),
            keepIds.length === 0 ? undefined : notInArray(splits.id, keepIds),
          ),
        );
      if (items.length > 0) {
        const stored = await tx
          .insert(splits)
          .values(items.map(toSplitInsert))
          .onConflictDoUpdate({
            target: splits.id,
            set: {
              accountId: sql`excluded.account_id`,
              name: sql`excluded.name`,
              position: sql`excluded.position`,
              match: sql`excluded.match`,
              rules: sql`excluded.rules`,
              exceptions: sql`excluded.exceptions`,
              exclusive: sql`excluded.exclusive`,
              hideTasks: sql`excluded.hide_tasks`,
            },
            setWhere: eq(splits.userId, userId),
          })
          .returning({ id: splits.id });
        if (stored.length < new Set(written).size) {
          throw new ConflictError('A split id is already in use');
        }
      }
      for (const { id, order } of keep) {
        await tx
          .update(splits)
          .set({ position: order })
          .where(and(eq(splits.userId, userId), eq(splits.id, id)));
      }
      return new PgSplitRepository(tx).listByUser(userId);
    });
  }

  private async entries(where: SQL | undefined): Promise<SplitEntry[]> {
    const rows = await this.db
      .select()
      .from(splits)
      .where(where)
      .orderBy(asc(splits.position), asc(splits.id));
    return rows.map(toSplitEntry);
  }
}
