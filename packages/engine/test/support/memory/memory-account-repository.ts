import type { AccountId, MailAccount, UserId } from '@relay/shared/domain';
import type { AccountChanges, AccountRepository, AccountStatusChange } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryAccountRepository implements AccountRepository {
  constructor(private readonly db: MemoryDatabase) {}

  listByUser(userId: UserId): Promise<MailAccount[]> {
    return Promise.resolve(
      [...this.db.tables.accounts.values()].filter((account) => account.userId === userId),
    );
  }

  findById(userId: UserId, accountId: AccountId): Promise<MailAccount | null> {
    const account = this.db.tables.accounts.get(accountId);
    return Promise.resolve(account?.userId === userId ? account : null);
  }

  findByEmail(userId: UserId, email: string): Promise<MailAccount | null> {
    const match = [...this.db.tables.accounts.values()].find(
      (account) => account.userId === userId && account.email.toLowerCase() === email.toLowerCase(),
    );
    return Promise.resolve(match ?? null);
  }

  listSyncable(): Promise<MailAccount[]> {
    return Promise.resolve([...this.db.tables.accounts.values()]);
  }

  create(account: MailAccount): Promise<MailAccount> {
    this.db.tables.accounts.set(account.id, account);
    return Promise.resolve(account);
  }

  update(
    userId: UserId,
    accountId: AccountId,
    changes: AccountChanges,
  ): Promise<MailAccount | null> {
    const account = this.db.tables.accounts.get(accountId);
    if (account?.userId !== userId) {
      return Promise.resolve(null);
    }
    const updated: MailAccount = { ...account, ...changes };
    this.db.tables.accounts.set(accountId, updated);
    return Promise.resolve(updated);
  }

  setPrimary(userId: UserId, accountId: AccountId): Promise<void> {
    this.db.tables.accounts.forEach((account, id) => {
      if (account.userId !== userId) {
        return;
      }
      this.db.tables.accounts.set(id, { ...account, isPrimary: id === accountId });
    });
    return Promise.resolve();
  }

  updateStatus(accountId: AccountId, change: AccountStatusChange): Promise<void> {
    const account = this.db.tables.accounts.get(accountId);
    if (account === undefined) {
      return Promise.resolve();
    }
    this.db.tables.accounts.set(accountId, {
      ...account,
      status: change.status,
      lastError: change.lastError,
      lastSyncedAt: change.lastSyncedAt ?? account.lastSyncedAt,
    });
    return Promise.resolve();
  }

  delete(userId: UserId, accountId: AccountId): Promise<boolean> {
    const tables = this.db.tables;
    if (tables.accounts.get(accountId)?.userId !== userId) {
      return Promise.resolve(false);
    }
    tables.accounts.delete(accountId);
    removeWhere(tables.mailboxes, (mailbox) => mailbox.accountId === accountId);
    removeWhere(tables.messages, (message) => message.accountId === accountId);
    removeWhere(tables.threads, (thread) => thread.accountId === accountId);
    removeWhere(tables.labels, (label) => label.accountId === accountId);
    removeWhere(tables.syncStates, (state) => state.accountId === accountId);
    return Promise.resolve(true);
  }
}

export const removeWhere = <Key, Value>(
  map: Map<Key, Value>,
  predicate: (value: Value) => boolean,
): Key[] => {
  const removed = [...map.entries()].filter(([, value]) => predicate(value)).map(([key]) => key);
  removed.forEach((key) => map.delete(key));
  return removed;
};
