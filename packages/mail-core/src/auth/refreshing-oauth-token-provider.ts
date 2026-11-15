import { ProviderError, type Clock, type ConditionalCredentialVault } from '@relay/engine';
import type {
  AccountId,
  MailAccount,
  OAuthCredentials,
  OAuthProviderKind,
} from '@relay/shared/domain';
import type { OAuthTokenProvider, OAuthTokenRefresher } from './oauth-token-provider';

export interface RefreshingOAuthTokenProviderOptions {
  readonly refreshers: Partial<Record<OAuthProviderKind, OAuthTokenRefresher>>;
  readonly vault: ConditionalCredentialVault;
  readonly clock: Clock;
  readonly expirySkewSeconds?: number;
}

const DEFAULT_EXPIRY_SKEW_SECONDS = 60;
const MAX_REFRESH_ATTEMPTS = 3;

export class RefreshingOAuthTokenProvider implements OAuthTokenProvider {
  private readonly inFlight = new Map<AccountId, Promise<OAuthCredentials>>();

  constructor(private readonly options: RefreshingOAuthTokenProviderOptions) {}

  async getAccessToken(account: MailAccount, credentials: OAuthCredentials): Promise<string> {
    const latest = await this.latestCredentials(account.id, credentials);
    if (!this.isExpired(latest)) {
      return latest.accessToken;
    }
    const refreshed = await this.refreshOnce(account.id, latest);
    return refreshed.accessToken;
  }

  private async latestCredentials(
    accountId: AccountId,
    fallback: OAuthCredentials,
  ): Promise<OAuthCredentials> {
    const stored = await this.options.vault.get(accountId);
    if (stored?.kind !== 'oauth') {
      return fallback;
    }
    return stored;
  }

  private isExpired(credentials: OAuthCredentials): boolean {
    const skew = (this.options.expirySkewSeconds ?? DEFAULT_EXPIRY_SKEW_SECONDS) * 1000;
    return Date.parse(credentials.expiresAt) - skew <= this.options.clock.now().getTime();
  }

  private refreshOnce(
    accountId: AccountId,
    credentials: OAuthCredentials,
  ): Promise<OAuthCredentials> {
    const pending = this.inFlight.get(accountId);
    if (pending) {
      return pending;
    }
    const refresh = this.refresh(accountId, credentials).finally(() => {
      this.inFlight.delete(accountId);
    });
    this.inFlight.set(accountId, refresh);
    return refresh;
  }

  private async refresh(
    accountId: AccountId,
    credentials: OAuthCredentials,
    attempt = 1,
  ): Promise<OAuthCredentials> {
    const refresher = this.options.refreshers[credentials.provider];
    if (!refresher) {
      throw new ProviderError(`No OAuth token refresher configured for ${credentials.provider}`);
    }
    const refreshed = await refresher.refresh(credentials);
    if (await this.options.vault.setIfUnchanged(accountId, credentials, refreshed)) {
      return refreshed;
    }
    const stored = await this.storedAfterConflict(accountId);
    if (!this.isExpired(stored)) {
      return stored;
    }
    if (attempt >= MAX_REFRESH_ATTEMPTS) {
      throw new ProviderError(
        `OAuth credentials of account ${accountId} kept changing to expired ones during refresh`,
      );
    }
    return this.refresh(accountId, stored, attempt + 1);
  }

  private async storedAfterConflict(accountId: AccountId): Promise<OAuthCredentials> {
    const stored = await this.options.vault.get(accountId);
    if (stored?.kind !== 'oauth') {
      throw new ProviderError(`OAuth credentials of account ${accountId} changed during refresh`);
    }
    return stored;
  }
}
