import type { Clock } from '@relay/engine';
import type { OAuthCredentials } from '@relay/shared/domain';
import type { OAuthTokenRefresher } from '../oauth-token-provider';
import type { GoogleOAuthClientConfig } from './google-oauth-config';
import { requestGoogleToken, type FetchFunction } from './google-token-endpoint';

export class GoogleOAuthTokenRefresher implements OAuthTokenRefresher {
  constructor(
    private readonly config: GoogleOAuthClientConfig,
    private readonly clock: Clock,
    private readonly fetchFn: FetchFunction = fetch,
  ) {}

  async refresh(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const token = await requestGoogleToken(
      this.config,
      { grant_type: 'refresh_token', refresh_token: credentials.refreshToken },
      this.fetchFn,
    );
    return {
      ...credentials,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? credentials.refreshToken,
      expiresAt: new Date(this.clock.now().getTime() + token.expires_in * 1000).toISOString(),
      scope: token.scope ?? credentials.scope,
    };
  }
}
