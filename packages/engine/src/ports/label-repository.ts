import type { AccountId, Label, LabelId, LabelKind, UserId } from '@relay/shared/domain';

export interface LabelRepository {
  list(userId: UserId, accountId: AccountId | null): Promise<Label[]>;
  findById(userId: UserId, labelId: LabelId): Promise<Label | null>;
  findByName(accountId: AccountId, name: string): Promise<Label | null>;
  findByRemoteName(
    accountId: AccountId,
    kind: LabelKind,
    remoteName: string,
  ): Promise<Label | null>;
  listByKind(accountId: AccountId, kind: LabelKind): Promise<Label[]>;
  upsert(label: Label): Promise<Label>;
  delete(userId: UserId, labelId: LabelId): Promise<boolean>;
}
