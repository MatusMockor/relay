import { AccountIdSchema } from '@relay/shared/domain';
import type { ReportedAccount } from '@relay/shared/ipc';
import type { AccountOverview } from '../../../src/main/native/account-overview';

export const accountOverview = (overrides: Partial<AccountOverview> = {}): AccountOverview => ({
  id: AccountIdSchema.parse('acc_work'),
  displayName: 'Práca',
  email: 'jana@firma.sk',
  color: '#4f6ef7',
  status: 'connected',
  lastSyncedAt: '2026-11-15T07:58:00.000Z',
  unread: 0,
  ...overrides,
});

export const withUnread = (unread: number): AccountOverview[] => [accountOverview({ unread })];

export const reportedAccount = (overview: AccountOverview): ReportedAccount => ({
  id: overview.id,
  displayName: overview.displayName,
  email: overview.email,
  color: overview.color,
  status: overview.status,
  lastSyncedAt: overview.lastSyncedAt,
});
