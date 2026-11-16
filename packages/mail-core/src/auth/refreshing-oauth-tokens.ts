import { ProviderError, type Clock } from '@relay/engine';
import type { AccountCredentials, OAuthCredentials, OAuthProviderKind } from '@relay/shared/domain';
import type { OAuthTokenRefresher } from './oauth-token-provider';

export interface KeyedCredentialStore<Key extends string> {
  get(key: Key): Promise<AccountCredentials | null>;
  setIfUnchanged(
    key: Key,
    expected: AccountCredentials,
    next: AccountCredentials,
  ): Promise<boolean>;
}

export interface RefreshingOAuthTokensOptions<Key extends string> {
  readonly refreshers: Partial<Record<OAuthProviderKind, OAuthTokenRefresher>>;
  readonly store: KeyedCredentialStore<Key>;
  readonly clock: Clock;
  readonly expirySkewSeconds?: number;
}

const DEFAULT_EXPIRY_SKEW_SECONDS = 60;
const MAX_REFRESH_ATTEMPTS = 3;

export class RefreshingOAuthTokens<Key extends string> {
  private readonly inFlight = new Map<Key, Promise<OAuthCredentials>>();

  constructor(private readonly options: RefreshingOAuthTokensOptions<Key>) {}

  async accessToken(key: Key, fallback: OAuthCredentials | null): Promise<string> {
    const latest = await this.latestCredentials(key, fallback);
    if (!this.isExpired(latest)) {
      return latest.accessToken;
    }
    const refreshed = await this.refreshOnce(key, latest);
    return refreshed.accessToken;
  }

  private async latestCredentials(
    key: Key,
    fallback: OAuthCredentials | null,
  ): Promise<OAuthCredentials> {
    const stored = await this.options.store.get(key);
    if (stored?.kind === 'oauth') {
      return stored;
    }
    if (fallback === null) {
      throw new ProviderError(`No OAuth credentials stored for ${key}`);
    }
    return fallback;
  }

  private isExpired(credentials: OAuthCredentials): boolean {
    const skew = (this.options.expirySkewSeconds ?? DEFAULT_EXPIRY_SKEW_SECONDS) * 1000;
    return Date.parse(credentials.expiresAt) - skew <= this.options.clock.now().getTime();
  }

  private refreshOnce(key: Key, credentials: OAuthCredentials): Promise<OAuthCredentials> {
    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }
    const refresh = this.refresh(key, credentials).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, refresh);
    return refresh;
  }

  private async refresh(
    key: Key,
    credentials: OAuthCredentials,
    attempt = 1,
  ): Promise<OAuthCredentials> {
    const refresher = this.options.refreshers[credentials.provider];
    if (!refresher) {
      throw new ProviderError(`No OAuth token refresher configured for ${credentials.provider}`);
    }
    const refreshed = await refresher.refresh(credentials);
    if (await this.options.store.setIfUnchanged(key, credentials, refreshed)) {
      return refreshed;
    }
    const stored = await this.storedAfterConflict(key);
    if (!this.isExpired(stored)) {
      return stored;
    }
    if (attempt >= MAX_REFRESH_ATTEMPTS) {
      throw new ProviderError(
        `OAuth credentials of ${key} kept changing to expired ones during refresh`,
      );
    }
    return this.refresh(key, stored, attempt + 1);
  }

  private async storedAfterConflict(key: Key): Promise<OAuthCredentials> {
    const stored = await this.options.store.get(key);
    if (stored?.kind !== 'oauth') {
      throw new ProviderError(`OAuth credentials of ${key} changed during refresh`);
    }
    return stored;
  }
}
