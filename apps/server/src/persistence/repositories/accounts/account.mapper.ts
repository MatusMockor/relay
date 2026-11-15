import type { AccountChanges } from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import type { mailAccounts } from '../../schema';
import { toDate, toDateOrNull, toIso, toIsoOrNull } from '../../support/timestamps';

type AccountRow = typeof mailAccounts.$inferSelect;
type AccountInsert = typeof mailAccounts.$inferInsert;

export const toMailAccount = (row: AccountRow): MailAccount => ({
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
  lastSyncedAt: toIsoOrNull(row.lastSyncedAt),
  createdAt: toIso(row.createdAt),
});

export const toAccountInsert = (account: MailAccount): AccountInsert => ({
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
  lastSyncedAt: toDateOrNull(account.lastSyncedAt),
  createdAt: toDate(account.createdAt),
});

export const toAccountUpdate = (changes: AccountChanges): Partial<AccountInsert> => ({
  ...(changes.displayName === undefined ? {} : { displayName: changes.displayName }),
  ...(changes.color === undefined ? {} : { color: changes.color }),
  ...(changes.isPrimary === undefined ? {} : { isPrimary: changes.isPrimary }),
  ...(changes.syncIntervalSeconds === undefined
    ? {}
    : { syncIntervalSeconds: changes.syncIntervalSeconds }),
  ...(changes.settings === undefined ? {} : { settings: changes.settings }),
});
