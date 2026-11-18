import type { AccountId, AccountStatus } from '@relay/shared/domain';

export interface AccountOverview {
  readonly id: AccountId;
  readonly displayName: string;
  readonly email: string;
  readonly color: string;
  readonly status: AccountStatus;
  readonly lastSyncedAt: string | null;
  readonly unread: number;
}

export const totalUnread = (accounts: readonly AccountOverview[]): number =>
  accounts.reduce((total, account) => total + account.unread, 0);
