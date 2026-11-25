import {
  type AccountChanges,
  type AccountRepository,
  type AccountStatusChange,
  ConflictError,
} from '@relay/engine';
import type { AccountId, MailAccount, UserId } from '@relay/shared/domain';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { mailAccounts } from '../../schema';
import { isUniqueViolation } from '../../support/postgres-errors';
import { lockUser, lockUserAccounts } from '../../support/ownership';
import { toDate } from '../../support/timestamps';
import { toAccountInsert, toAccountUpdate, toMailAccount } from './account.mapper';
import {
  IN_ACCOUNT_ORDER,
  lockAccountsOf,
  nextAccountPosition,
  writeAccountPositions,
} from './account-positions';

const ownedBy = (userId: UserId, accountId: AccountId) =>
  and(eq(mailAccounts.userId, userId), eq(mailAccounts.id, accountId));

export class PgAccountRepository implements AccountRepository {
  constructor(private readonly db: DbExecutor) {}

  async listByUser(userId: UserId): Promise<MailAccount[]> {
    const rows = await this.db
      .select()
      .from(mailAccounts)
      .where(eq(mailAccounts.userId, userId))
      .orderBy(...IN_ACCOUNT_ORDER);
    return rows.map(toMailAccount);
  }

  async listByUserForUpdate(userId: UserId): Promise<MailAccount[]> {
    return (await lockAccountsOf(this.db, userId)).map(toMailAccount);
  }

  async findById(userId: UserId, accountId: AccountId): Promise<MailAccount | null> {
    const [row] = await this.db.select().from(mailAccounts).where(ownedBy(userId, accountId));
    return row === undefined ? null : toMailAccount(row);
  }

  async findByEmail(userId: UserId, email: string): Promise<MailAccount | null> {
    const [row] = await this.db
      .select()
      .from(mailAccounts)
      .where(
        and(eq(mailAccounts.userId, userId), sql`lower(${mailAccounts.email}) = lower(${email})`),
      );
    return row === undefined ? null : toMailAccount(row);
  }

  async listSyncable(): Promise<MailAccount[]> {
    const rows = await this.db
      .select()
      .from(mailAccounts)
      .where(ne(mailAccounts.status, 'disconnected'))
      .orderBy(...IN_ACCOUNT_ORDER);
    return rows.map(toMailAccount);
  }

  async create(account: MailAccount): Promise<MailAccount> {
    try {
      return await this.db.transaction(async (tx) => {
        await lockUserAccounts(tx, account.userId);
        if (account.isPrimary) {
          await new PgAccountRepository(tx).clearPrimary(account.userId);
        }
        const [row] = await tx
          .insert(mailAccounts)
          .values({ ...toAccountInsert(account), sortOrder: nextAccountPosition(account.userId) })
          .returning();
        return row === undefined ? account : toMailAccount(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(`Account ${account.email} already exists`, { cause: error });
      }
      throw error;
    }
  }

  async update(
    userId: UserId,
    accountId: AccountId,
    changes: AccountChanges,
  ): Promise<MailAccount | null> {
    return this.db.transaction(async (tx) => {
      const repository = new PgAccountRepository(tx);
      if (changes.isPrimary === true) {
        await lockUser(tx, userId);
      }
      const existing = await repository.lockOwned(userId, accountId);
      if (existing === null) {
        return null;
      }
      if (changes.isPrimary === true) {
        await repository.clearPrimary(userId);
      }
      const values = toAccountUpdate(changes);
      if (Object.keys(values).length === 0) {
        return existing;
      }
      const [row] = await tx
        .update(mailAccounts)
        .set(values)
        .where(ownedBy(userId, accountId))
        .returning();
      return row === undefined ? null : toMailAccount(row);
    });
  }

  async setPrimary(userId: UserId, accountId: AccountId): Promise<void> {
    await this.update(userId, accountId, { isPrimary: true });
  }

  reorder(userId: UserId, orderedIds: readonly AccountId[]): Promise<number> {
    return writeAccountPositions(this.db, userId, orderedIds);
  }

  async updateStatus(accountId: AccountId, change: AccountStatusChange): Promise<void> {
    await this.db
      .update(mailAccounts)
      .set({
        status: change.status,
        lastError: change.lastError,
        ...(change.lastSyncedAt === undefined ? {} : { lastSyncedAt: toDate(change.lastSyncedAt) }),
      })
      .where(eq(mailAccounts.id, accountId));
  }

  delete(userId: UserId, accountId: AccountId): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await lockUserAccounts(tx, userId);
      const rows = await tx
        .delete(mailAccounts)
        .where(ownedBy(userId, accountId))
        .returning({ id: mailAccounts.id });
      return rows.length > 0;
    });
  }

  private async lockOwned(userId: UserId, accountId: AccountId): Promise<MailAccount | null> {
    const [row] = await this.db
      .select()
      .from(mailAccounts)
      .where(ownedBy(userId, accountId))
      .for('update');
    return row === undefined ? null : toMailAccount(row);
  }

  private async clearPrimary(userId: UserId): Promise<void> {
    await this.db
      .update(mailAccounts)
      .set({ isPrimary: false })
      .where(and(eq(mailAccounts.userId, userId), eq(mailAccounts.isPrimary, true)));
  }
}
