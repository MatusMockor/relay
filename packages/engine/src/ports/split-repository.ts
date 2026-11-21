import type { AccountId, Split, SplitId, UnsupportedSplit, UserId } from '@relay/shared/domain';

export interface KeptSplit {
  readonly id: SplitId;
  readonly order: number;
}

export interface SplitRepository {
  listByUser(userId: UserId): Promise<Split[]>;
  listUnsupported(userId: UserId): Promise<UnsupportedSplit[]>;
  listForAccount(userId: UserId, accountId: AccountId): Promise<Split[]>;
  replaceAll(
    userId: UserId,
    splits: readonly Split[],
    keep?: readonly KeptSplit[],
  ): Promise<Split[]>;
}
