import type { AccountId, Split, UserId } from '@relay/shared/domain';
import type { SplitRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemorySplitRepository implements SplitRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listByUser(userId: UserId): Promise<Split[]> {
    const splits = this.db.tables.splits.get(userId) ?? [];
    return Promise.resolve([...splits].sort((a, b) => a.order - b.order));
  }

  async listForAccount(userId: UserId, accountId: AccountId): Promise<Split[]> {
    const splits = await this.listByUser(userId);
    return splits.filter((split) => split.accountId === null || split.accountId === accountId);
  }

  replaceAll(userId: UserId, splits: readonly Split[]): Promise<Split[]> {
    this.db.tables.splits.set(userId, [...splits]);
    return this.listByUser(userId);
  }
}
