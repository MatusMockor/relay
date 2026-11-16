import type { Clock, ConditionalCredentialVault } from '@relay/engine';
import type {
  AccountId,
  MailAccount,
  OAuthCredentials,
  OAuthProviderKind,
} from '@relay/shared/domain';
import type { OAuthTokenProvider, OAuthTokenRefresher } from './oauth-token-provider';
import { RefreshingOAuthTokens } from './refreshing-oauth-tokens';

export interface RefreshingOAuthTokenProviderOptions {
  readonly refreshers: Partial<Record<OAuthProviderKind, OAuthTokenRefresher>>;
  readonly vault: ConditionalCredentialVault;
  readonly clock: Clock;
  readonly expirySkewSeconds?: number;
}

export class RefreshingOAuthTokenProvider implements OAuthTokenProvider {
  private readonly tokens: RefreshingOAuthTokens<AccountId>;

  constructor(options: RefreshingOAuthTokenProviderOptions) {
    this.tokens = new RefreshingOAuthTokens({ ...options, store: options.vault });
  }

  getAccessToken(account: MailAccount, credentials: OAuthCredentials): Promise<string> {
    return this.tokens.accessToken(account.id, credentials);
  }
}
