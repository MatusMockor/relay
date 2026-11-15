import type { SplitRepository } from '@relay/engine';
import type { AccountId, Split, UserId } from '@relay/shared/domain';
import { and, asc, eq, inArray, isNull, notInArray, or } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toSplit, toSplitRow } from '../mappers/split-mapper';
import { splits, threadSplits } from '../schema';

export class SqliteSplitRepository implements SplitRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listByUser(userId: UserId): Promise<Split[]> {
    return this.executor.execute((db) => this.listOwned(db, userId));
  }

  listForAccount(userId: UserId, accountId: AccountId): Promise<Split[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(splits)
        .where(
          and(
            eq(splits.userId, userId),
            or(isNull(splits.accountId), eq(splits.accountId, accountId)),
          ),
        )
        .orderBy(asc(splits.position), asc(splits.id))
        .all()
        .map(toSplit),
    );
  }

  replaceAll(userId: UserId, items: readonly Split[]): Promise<Split[]> {
    return this.executor.execute((db) => {
      const keepIds = items.map((split) => split.id);
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
      return this.listOwned(db, userId);
    });
  }

  private listOwned(db: RelayDb, userId: UserId): Split[] {
    return db
      .select()
      .from(splits)
      .where(eq(splits.userId, userId))
      .orderBy(asc(splits.position), asc(splits.id))
      .all()
      .map(toSplit);
  }
}
