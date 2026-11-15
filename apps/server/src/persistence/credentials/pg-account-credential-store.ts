import type { AccountId } from '@relay/shared/domain';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../database/database';
import { accountCredentials } from '../schema';
import { findAccountOwner } from '../support/account-owner';

export class PgAccountCredentialStore {
  constructor(private readonly db: DbExecutor) {}

  async find(accountId: AccountId): Promise<string | null> {
    const [row] = await this.db
      .select({ envelope: accountCredentials.envelope })
      .from(accountCredentials)
      .where(eq(accountCredentials.accountId, accountId));
    return row?.envelope ?? null;
  }

  async save(accountId: AccountId, envelope: string): Promise<void> {
    const userId = await findAccountOwner(this.db, accountId);
    const updatedAt = new Date();
    await this.db
      .insert(accountCredentials)
      .values({ accountId, userId, envelope, updatedAt })
      .onConflictDoUpdate({ target: accountCredentials.accountId, set: { envelope, updatedAt } });
  }

  async replace(accountId: AccountId, expected: string, next: string): Promise<boolean> {
    const updated = await this.db
      .update(accountCredentials)
      .set({ envelope: next, updatedAt: new Date() })
      .where(
        and(eq(accountCredentials.accountId, accountId), eq(accountCredentials.envelope, expected)),
      )
      .returning({ accountId: accountCredentials.accountId });
    return updated.length === 1;
  }

  async delete(accountId: AccountId): Promise<void> {
    await this.db.delete(accountCredentials).where(eq(accountCredentials.accountId, accountId));
  }
}
