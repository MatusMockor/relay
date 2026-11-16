import { googleScopesFor } from '@relay/mail-core';
import type { GoogleCalendarConnection } from '@relay/shared/domain';
import type {
  GoogleCalendarAuthorizeInput,
  GoogleCalendarAuthorizeOutput,
} from '@relay/shared/ipc';
import type { GoogleAuthorization, GoogleLoopbackFlow } from './google-loopback-flow';
import { OAuthFlowError } from './oauth-errors';
import type { SingleFlightOAuth } from './single-flight-oauth';

export interface GoogleCalendarConnector {
  connect(
    authorization: GoogleAuthorization,
    loginHint: string | undefined,
    signal: AbortSignal,
  ): Promise<GoogleCalendarConnection>;
}

export class GoogleCalendarOAuthCoordinator {
  constructor(
    private readonly flow: GoogleLoopbackFlow,
    private readonly localConnector: GoogleCalendarConnector,
    private readonly flights: SingleFlightOAuth,
  ) {}

  authorize(input: GoogleCalendarAuthorizeInput): Promise<GoogleCalendarAuthorizeOutput> {
    return this.flights.run((signal) => this.run(input, signal));
  }

  private async run(
    input: GoogleCalendarAuthorizeInput,
    signal: AbortSignal,
  ): Promise<GoogleCalendarAuthorizeOutput> {
    const authorization = await this.flow.authorize({
      signal,
      scopes: googleScopesFor({ mail: false, calendar: true }),
      includeGrantedScopes: true,
      ...(input.loginHint === undefined ? {} : { loginHint: input.loginHint }),
    });
    if (signal.aborted) {
      throw new OAuthFlowError('Prihlásenie cez Google bolo zrušené');
    }
    if (input.mode === 'synced') {
      return { mode: 'synced', grant: authorization.grant };
    }
    return {
      mode: 'local',
      connection: await this.localConnector.connect(authorization, input.loginHint, signal),
    };
  }
}
