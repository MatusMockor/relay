import type { AccountId, ImapSmtpSettings, MailAccount, UserId } from '@relay/shared/domain';

const FALLBACK_EMAIL = 'connection-test@relay.invalid';

export const transientAccount = (settings: ImapSmtpSettings): MailAccount => {
  const email = settings.username.includes('@') ? settings.username : FALLBACK_EMAIL;
  return {
    id: 'connection-test' as AccountId,
    userId: 'connection-test' as UserId,
    provider: 'imap',
    displayName: email,
    email,
    color: '#5b8def',
    isPrimary: false,
    syncIntervalSeconds: 300,
    settings,
    status: 'disconnected',
    lastError: null,
    lastSyncedAt: null,
    createdAt: new Date(0).toISOString(),
  };
};
