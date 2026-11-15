import type { MailAccount, OAuthCredentials } from '@relay/shared/domain';

export interface OAuthTokenProvider {
  getAccessToken(account: MailAccount, credentials: OAuthCredentials): Promise<string>;
}

export interface OAuthTokenRefresher {
  refresh(credentials: OAuthCredentials): Promise<OAuthCredentials>;
}
