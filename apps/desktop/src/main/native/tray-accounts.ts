import type { ReportedAccount } from '@relay/shared/ipc';
import type { AccountOverview } from './account-overview';

export interface TrayAccount extends ReportedAccount {
  readonly unread: number | null;
}

export const trayAccountsOf = (
  reported: readonly ReportedAccount[],
  local: readonly AccountOverview[],
): TrayAccount[] => {
  const known = new Map(local.map((overview) => [overview.id as string, overview]));
  return reported.map((account) => {
    const overview = known.get(account.id);
    if (overview === undefined) {
      return { ...account, unread: null };
    }
    return {
      ...account,
      status: overview.status,
      lastSyncedAt: overview.lastSyncedAt,
      unread: overview.unread,
    };
  });
};

export const knownUnreadTotal = (accounts: readonly TrayAccount[]): number | null =>
  accounts.reduce<number | null>(
    (total, account) => (total === null || account.unread === null ? null : total + account.unread),
    0,
  );
