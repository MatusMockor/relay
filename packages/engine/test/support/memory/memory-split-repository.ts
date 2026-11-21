import type { AccountId, Split, UnsupportedSplit, UserId } from '@relay/shared/domain';
import type { KeptSplit, SplitRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemorySplitRepository implements SplitRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listByUser(userId: UserId): Promise<Split[]> {
    const splits = this.db.tables.splits.get(userId) ?? [];
    return Promise.resolve([...splits].sort((a, b) => a.order - b.order));
  }

  listUnsupported(userId: UserId): Promise<UnsupportedSplit[]> {
    return Promise.resolve([...(this.db.tables.unsupportedSplits.get(userId) ?? [])]);
  }

  async listForAccount(userId: UserId, accountId: AccountId): Promise<Split[]> {
    const splits = await this.listByUser(userId);
    return splits.filter((split) => split.accountId === null || split.accountId === accountId);
  }

  replaceAll(
    userId: UserId,
    splits: readonly Split[],
    keep: readonly KeptSplit[] = [],
  ): Promise<Split[]> {
    this.db.tables.splits.set(userId, [...splits]);
    const unsupported = this.db.tables.unsupportedSplits.get(userId) ?? [];
    this.db.tables.unsupportedSplits.set(
      userId,
      unsupported.map((entry) => {
        const kept = keep.find(({ id }) => id === entry.id);
        return kept === undefined ? entry : { ...entry, order: kept.order };
      }),
    );
    return this.listByUser(userId);
  }
}
