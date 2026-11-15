import type { Clock } from '@relay/engine';
import { GoogleOAuthTokenRefresher, type OAuthTokenRefresher } from '@relay/mail-core';
import type { OAuthCredentials } from '@relay/shared/domain';
import type { GoogleClientConfigSource } from './google-client-config-source';

export class LazyGoogleTokenRefresher implements OAuthTokenRefresher {
  constructor(
    private readonly configSource: GoogleClientConfigSource,
    private readonly clock: Clock,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async refresh(credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const config = await this.configSource.load();
    return new GoogleOAuthTokenRefresher(config, this.clock, this.fetchFn).refresh(credentials);
  }
}
