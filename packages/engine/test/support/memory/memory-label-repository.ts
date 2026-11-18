import type { AccountId, Label, LabelId, LabelKind, UserId } from '@relay/shared/domain';
import type { LabelRepository } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryLabelRepository implements LabelRepository {
  constructor(private readonly db: MemoryDatabase) {}

  list(userId: UserId, accountId: AccountId | null): Promise<Label[]> {
    return Promise.resolve(
      this.all().filter(
        (label) =>
          this.db.ownsAccount(userId, label.accountId) &&
          (accountId === null || label.accountId === accountId),
      ),
    );
  }

  findById(userId: UserId, labelId: LabelId): Promise<Label | null> {
    const label = this.db.tables.labels.get(labelId);
    if (label === undefined || !this.db.ownsAccount(userId, label.accountId)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(label);
  }

  findByName(accountId: AccountId, name: string): Promise<Label | null> {
    const match = this.all().find((label) => label.accountId === accountId && label.name === name);
    return Promise.resolve(match ?? null);
  }

  findByRemoteName(
    accountId: AccountId,
    kind: LabelKind,
    remoteName: string,
  ): Promise<Label | null> {
    const match = this.all().find(
      (label) =>
        label.accountId === accountId && label.kind === kind && label.remoteName === remoteName,
    );
    return Promise.resolve(match ?? null);
  }

  listByKind(accountId: AccountId, kind: LabelKind): Promise<Label[]> {
    return Promise.resolve(
      this.all()
        .filter((label) => label.accountId === accountId && label.kind === kind)
        .sort((left, right) => left.name.localeCompare(right.name)),
    );
  }

  upsert(label: Label): Promise<Label> {
    this.db.tables.labels.set(label.id, label);
    return Promise.resolve(label);
  }

  delete(userId: UserId, labelId: LabelId): Promise<boolean> {
    const label = this.db.tables.labels.get(labelId);
    if (label === undefined || !this.db.ownsAccount(userId, label.accountId)) {
      return Promise.resolve(false);
    }
    this.detach(labelId);
    return Promise.resolve(this.db.tables.labels.delete(labelId));
  }

  private detach(labelId: LabelId): void {
    const { messages, threads } = this.db.tables;
    messages.forEach((message, id) =>
      messages.set(id, {
        ...message,
        labelIds: message.labelIds.filter((item) => item !== labelId),
      }),
    );
    threads.forEach((thread, id) =>
      threads.set(id, { ...thread, labelIds: thread.labelIds.filter((item) => item !== labelId) }),
    );
  }

  private all(): Label[] {
    return [...this.db.tables.labels.values()];
  }
}
