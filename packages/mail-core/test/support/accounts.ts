import type { GreenMailUser } from '@relay/config/test-infra';
import type { AccountCredentials, AccountId, MailAccount, UserId } from '@relay/shared/domain';
import { greenmailImap, greenmailSmtp } from './greenmail';

export const buildAccount = (
  user: GreenMailUser,
  overrides: Partial<MailAccount> = {},
): MailAccount => ({
  id: `acc_${user.login.replace(/[^A-Za-z0-9]/g, '')}` as AccountId,
  userId: 'user_test' as UserId,
  provider: 'imap',
  displayName: 'Test',
  senderName: 'Test',
  email: user.email,
  color: '#336699',
  isPrimary: true,
  syncIntervalSeconds: 60,
  settings: { imap: greenmailImap, smtp: greenmailSmtp, username: user.login },
  status: 'connected',
  lastError: null,
  lastSyncedAt: null,
  createdAt: '2026-11-15T10:00:00.000Z',
  ...overrides,
});

export const passwordCredentials = (user: GreenMailUser): AccountCredentials => ({
  kind: 'password',
  password: user.password,
});
