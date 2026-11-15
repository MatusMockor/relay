import { ProviderError } from '@relay/engine';
import type { OAuthCredentials } from '@relay/shared/domain';
import { readIdTokenEmail } from './google-id-token';
import type { GoogleOAuthClientConfig } from './google-oauth-config';
import { requestGoogleToken, type FetchFunction } from './google-token-endpoint';

export interface ExchangeGoogleCodeInput {
  readonly config: GoogleOAuthClientConfig;
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly now?: Date;
  readonly fetch?: FetchFunction;
}

export interface GoogleCodeExchangeResult {
  readonly credentials: OAuthCredentials;
  readonly email: string | null;
}

export const exchangeGoogleCode = async (
  input: ExchangeGoogleCodeInput,
): Promise<GoogleCodeExchangeResult> => {
  const token = await requestGoogleToken(
    input.config,
    {
      grant_type: 'authorization_code',
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    },
    input.fetch,
  );
  if (!token.refresh_token) {
    throw new ProviderError('Google did not return a refresh token');
  }
  const issuedAt = (input.now ?? new Date()).getTime();
  return {
    credentials: {
      kind: 'oauth',
      provider: 'gmail',
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(issuedAt + token.expires_in * 1000).toISOString(),
      scope: token.scope ?? null,
    },
    email: readIdTokenEmail(token.id_token),
  };
};
