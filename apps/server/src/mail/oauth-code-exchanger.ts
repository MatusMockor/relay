import type { OAuthGrant } from '@relay/shared/api';
import type { OAuthCredentials } from '@relay/shared/domain';

export const OAUTH_CODE_EXCHANGER = Symbol.for('relay.server.OAuthCodeExchanger');

export interface ExchangedOAuthGrant {
  readonly credentials: OAuthCredentials;
  readonly email: string | null;
}

export interface OAuthCodeExchanger {
  exchangeGoogle(grant: OAuthGrant): Promise<ExchangedOAuthGrant>;
}
