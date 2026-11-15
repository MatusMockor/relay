import { type MailAccount, MailAccountSchema } from '@relay/shared/domain';
import type { AccountRow, accounts } from '../schema';

export const toMailAccount = (row: AccountRow): MailAccount =>
  MailAccountSchema.parse({
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    displayName: row.displayName,
    email: row.email,
    color: row.color,
    isPrimary: row.isPrimary,
    syncIntervalSeconds: row.syncIntervalSeconds,
    settings: row.settings,
    status: row.status,
    lastError: row.lastError,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
  });

export const toAccountRow = (account: MailAccount): typeof accounts.$inferInsert => ({
  id: account.id,
  userId: account.userId,
  provider: account.provider,
  displayName: account.displayName,
  email: account.email,
  color: account.color,
  isPrimary: account.isPrimary,
  syncIntervalSeconds: account.syncIntervalSeconds,
  settings: account.settings,
  status: account.status,
  lastError: account.lastError,
  lastSyncedAt: account.lastSyncedAt,
  createdAt: account.createdAt,
});
