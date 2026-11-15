import { type Clock, ForbiddenError, ValidationError } from '@relay/engine';
import { exchangeGoogleCode } from '@relay/mail-core';
import type { OAuthGrant } from '@relay/shared/api';
import type { GoogleOAuthConfig } from '../config/server-config';
import { toGoogleClientConfig } from './google-client-config';
import type { ExchangedOAuthGrant, OAuthCodeExchanger } from './oauth-code-exchanger';

export class GoogleCodeExchanger implements OAuthCodeExchanger {
  constructor(
    private readonly google: GoogleOAuthConfig | null,
    private readonly clock: Clock,
  ) {}

  async exchangeGoogle(grant: OAuthGrant): Promise<ExchangedOAuthGrant> {
    if (this.google === null) {
      throw new ForbiddenError('Google OAuth is not configured on this server');
    }
    if (grant.codeVerifier === null) {
      throw new ValidationError('A PKCE code verifier is required for Google accounts');
    }
    return exchangeGoogleCode({
      config: toGoogleClientConfig(this.google),
      code: grant.code,
      codeVerifier: grant.codeVerifier,
      redirectUri: grant.redirectUri,
      now: this.clock.now(),
    });
  }
}
