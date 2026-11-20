import type { KeptSplit, SplitRepository } from '@relay/engine';
import {
  type AccountId,
  isUnsupportedSplit,
  type Split,
  type SplitEntry,
  supportedSplits,
  type UnsupportedSplit,
  type UserId,
} from '@relay/shared/domain';
import { and, asc, eq, inArray, isNull, notInArray, or, type SQL } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toSplitEntry, toSplitRow } from '../mappers/split-mapper';
import { splits, threadSplits } from '../schema';

export class SqliteSplitRepository implements SplitRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listByUser(userId: UserId): Promise<Split[]> {
    return this.executor.execute((db) => supportedSplits(this.listOwned(db, userId)));
  }

  listUnsupported(userId: UserId): Promise<UnsupportedSplit[]> {
    return this.executor.execute((db) => this.listOwned(db, userId).filter(isUnsupportedSplit));
  }

  listForAccount(userId: UserId, accountId: AccountId): Promise<Split[]> {
    return this.executor.execute((db) =>
      supportedSplits(
        this.listWhere(
          db,
          and(
            eq(splits.userId, userId),
            or(isNull(splits.accountId), eq(splits.accountId, accountId)),
          ),
        ),
      ),
    );
  }

  replaceAll(
    userId: UserId,
    items: readonly Split[],
    keep: readonly KeptSplit[] = [],
  ): Promise<Split[]> {
    return this.executor.execute((db) => {
      const keepIds = [...items.map((split) => split.id), ...keep.map(({ id }) => id)];
      const removed = db
        .delete(splits)
        .where(and(eq(splits.userId, userId), notInArray(splits.id, keepIds)))
        .returning({ id: splits.id })
        .all()
        .map((row) => row.id);
      if (removed.length > 0) {
        db.delete(threadSplits).where(inArray(threadSplits.splitId, removed)).run();
      }
      items.forEach((split) => {
        const { id: _id, ...changes } = toSplitRow(userId, split);
        db.insert(splits)
          .values(toSplitRow(userId, split))
          .onConflictDoUpdate({ target: splits.id, set: changes })
          .run();
      });
      keep.forEach(({ id, order }) => {
        db.update(splits)
          .set({ position: order })
          .where(and(eq(splits.userId, userId), eq(splits.id, id)))
          .run();
      });
      return supportedSplits(this.listOwned(db, userId));
    });
  }

  private listOwned(db: RelayDb, userId: UserId): SplitEntry[] {
    return this.listWhere(db, eq(splits.userId, userId));
  }

  private listWhere(db: RelayDb, where: SQL | undefined): SplitEntry[] {
    return db
      .select()
      .from(splits)
      .where(where)
      .orderBy(asc(splits.position), asc(splits.id))
      .all()
      .map(toSplitEntry);
  }
}
