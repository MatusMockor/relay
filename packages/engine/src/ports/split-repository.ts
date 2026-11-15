import type { AccountId, Split, UserId } from '@relay/shared/domain';

export interface SplitRepository {
  listByUser(userId: UserId): Promise<Split[]>;
  listForAccount(userId: UserId, accountId: AccountId): Promise<Split[]>;
  replaceAll(userId: UserId, splits: readonly Split[]): Promise<Split[]>;
}
