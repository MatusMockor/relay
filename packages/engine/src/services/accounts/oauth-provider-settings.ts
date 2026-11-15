import type { ImapSmtpSettings, OAuthProviderKind } from '@relay/shared/domain';

export const oauthProviderSettings = (
  provider: OAuthProviderKind,
  email: string,
): ImapSmtpSettings => {
  if (provider === 'gmail') {
    return {
      imap: { host: 'imap.gmail.com', port: 993, secure: true },
      smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
      username: email,
    };
  }
  return {
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    username: email,
  };
};
