import type { EngineServices } from '@relay/engine';
import { ValidationError } from '@relay/engine';
import { exchangeGoogleCode } from '@relay/mail-core';
import type { GoogleCalendarConnection, UserId } from '@relay/shared/domain';
import type { GoogleCalendarConnector } from '../oauth/google-calendar-oauth-coordinator';
import type { GoogleAuthorization } from '../oauth/google-loopback-flow';
import { OAuthFlowError } from '../oauth/oauth-errors';

export class EngineGoogleCalendarConnector implements GoogleCalendarConnector {
  constructor(
    private readonly services: Pick<EngineServices, 'googleCalendar'>,
    private readonly userId: UserId,
  ) {}

  async connect(
    authorization: GoogleAuthorization,
    loginHint: string | undefined,
    signal: AbortSignal,
  ): Promise<GoogleCalendarConnection> {
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
    return this.services.googleCalendar.connect(this.userId, {
      email,
      credentials: exchanged.credentials,
    });
  }
}
