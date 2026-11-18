import type { AccountStatus } from '@relay/shared/domain';

export interface SyncedAccount {
  readonly status: AccountStatus;
  readonly lastSyncedAt: string | null;
}

export type TraySyncStatus =
  | { readonly kind: 'no-accounts' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'syncing' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'synced'; readonly at: Date };

const latestSync = (accounts: readonly SyncedAccount[]): Date | null => {
  const times = accounts
    .map((account) =>
      account.lastSyncedAt === null ? Number.NaN : Date.parse(account.lastSyncedAt),
    )
    .filter((time) => !Number.isNaN(time));
  if (times.length === 0) {
    return null;
  }
  return new Date(Math.max(...times));
};

export const traySyncStatusOf = (accounts: readonly SyncedAccount[]): TraySyncStatus => {
  if (accounts.length === 0) {
    return { kind: 'no-accounts' };
  }
  if (accounts.some((account) => account.status === 'error')) {
    return { kind: 'failed' };
  }
  if (accounts.some((account) => account.status === 'syncing')) {
    return { kind: 'syncing' };
  }
  const at = latestSync(accounts);
  if (at === null) {
    return { kind: 'waiting' };
  }
  return { kind: 'synced', at };
};
