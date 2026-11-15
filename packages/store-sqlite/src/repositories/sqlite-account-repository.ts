import type { AccountChanges, AccountRepository, AccountStatusChange } from '@relay/engine';
import { NotFoundError } from '@relay/engine';
import type { AccountId, MailAccount, UserId } from '@relay/shared/domain';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import type { RelayDb } from '../database/sqlite-database';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toAccountRow, toMailAccount } from '../mappers/account-mapper';
import { accounts } from '../schema';

const ownedBy = (userId: UserId, accountId: AccountId) =>
  and(eq(accounts.userId, userId), eq(accounts.id, accountId));

export class SqliteAccountRepository implements AccountRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  listByUser(userId: UserId): Promise<MailAccount[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(accounts)
        .where(eq(accounts.userId, userId))
        .orderBy(asc(accounts.createdAt), asc(accounts.id))
        .all()
        .map(toMailAccount),
    );
  }

  findById(userId: UserId, accountId: AccountId): Promise<MailAccount | null> {
    return this.executor.execute((db) => this.find(db, userId, accountId));
  }

  findByEmail(userId: UserId, email: string): Promise<MailAccount | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, userId), sql`lower(${accounts.email}) = lower(${email})`))
        .get();
      return row === undefined ? null : toMailAccount(row);
    });
  }

  listSyncable(): Promise<MailAccount[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(accounts)
        .where(ne(accounts.status, 'disconnected'))
        .orderBy(asc(accounts.createdAt), asc(accounts.id))
        .all()
        .map(toMailAccount),
    );
  }

  create(account: MailAccount): Promise<MailAccount> {
    return this.executor.execute((db) => {
      db.insert(accounts).values(toAccountRow(account)).run();
      if (account.isPrimary) {
        this.makePrimary(db, account.userId, account.id);
      }
      return account;
    });
  }

  update(
    userId: UserId,
    accountId: AccountId,
    changes: AccountChanges,
  ): Promise<MailAccount | null> {
    return this.executor.execute((db) => {
      if (Object.keys(changes).length === 0) {
        return this.find(db, userId, accountId);
      }
      const result = db.update(accounts).set(changes).where(ownedBy(userId, accountId)).run();
      if (result.changes === 0) {
        return null;
      }
      if (changes.isPrimary === true) {
        this.makePrimary(db, userId, accountId);
      }
      return this.find(db, userId, accountId);
    });
  }

  setPrimary(userId: UserId, accountId: AccountId): Promise<void> {
    return this.executor.execute((db) => {
      if (this.find(db, userId, accountId) === null) {
        throw new NotFoundError('Account', accountId);
      }
      this.makePrimary(db, userId, accountId);
    });
  }

  updateStatus(accountId: AccountId, change: AccountStatusChange): Promise<void> {
    return this.executor.execute((db) => {
      db.update(accounts)
        .set({
          status: change.status,
          lastError: change.lastError,
          ...(change.lastSyncedAt === undefined ? {} : { lastSyncedAt: change.lastSyncedAt }),
        })
        .where(eq(accounts.id, accountId))
        .run();
    });
  }

  delete(userId: UserId, accountId: AccountId): Promise<boolean> {
    return this.executor.execute(
      (db) => db.delete(accounts).where(ownedBy(userId, accountId)).run().changes > 0,
    );
  }

  private find(db: RelayDb, userId: UserId, accountId: AccountId): MailAccount | null {
    const row = db.select().from(accounts).where(ownedBy(userId, accountId)).get();
    return row === undefined ? null : toMailAccount(row);
  }

  private makePrimary(db: RelayDb, userId: UserId, accountId: AccountId): void {
    db.update(accounts)
      .set({ isPrimary: sql`${accounts.id} = ${accountId}` })
      .where(eq(accounts.userId, userId))
      .run();
  }
}
