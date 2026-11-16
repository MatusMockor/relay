import type { EngineServices } from '@relay/engine';
import { grantsGoogleCalendar, ValidationError } from '@relay/engine';
import { exchangeGoogleCode } from '@relay/mail-core';
import type { MailAccount, UserId } from '@relay/shared/domain';
import type { GoogleAuthorization } from '../oauth/google-loopback-flow';
import { OAuthFlowError } from '../oauth/oauth-errors';
import type { GoogleAccountConnector } from '../oauth/google-oauth-coordinator';

export interface GoogleAccountConnectorOptions {
  readonly verifyConnection: boolean;
}

export class EngineGoogleAccountConnector implements GoogleAccountConnector {
  constructor(
    private readonly services: Pick<EngineServices, 'accounts' | 'googleCalendar'>,
    private readonly userId: UserId,
    private readonly options: GoogleAccountConnectorOptions,
  ) {}

  async connect(
    authorization: GoogleAuthorization,
    loginHint: string | undefined,
    signal: AbortSignal,
  ): Promise<MailAccount> {
    const { grant, config } = authorization;
    const exchanged = await exchangeGoogleCode({
      config,
      code: grant.code,
      codeVerifier: grant.codeVerifier,
      redirectUri: grant.redirectUri,
    });
    if (signal.aborted) {
      throw new OAuthFlowError('Prihlásenie cez Google bolo zrušené');
    }
    const email = exchanged.email ?? loginHint ?? null;
    if (email === null) {
      throw new ValidationError('Google nevrátil e-mailovú adresu účtu');
    }
    const account = await this.services.accounts.createOAuth(this.userId, {
      provider: 'gmail',
      email,
      credentials: exchanged.credentials,
      verify: this.options.verifyConnection,
    });
    if (grantsGoogleCalendar(exchanged.credentials.scope)) {
      await this.services.googleCalendar
        .connect(this.userId, { email: account.email, credentials: exchanged.credentials })
        .catch(() => undefined);
    }
    return account;
  }
}
