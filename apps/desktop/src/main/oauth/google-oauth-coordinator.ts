import { googleScopesFor } from '@relay/mail-core';
import type { MailAccount } from '@relay/shared/domain';
import type { GoogleAuthorizeInput, GoogleAuthorizeOutput } from '@relay/shared/ipc';
import type { GoogleAuthorization, GoogleLoopbackFlow } from './google-loopback-flow';
import { OAuthFlowError } from './oauth-errors';
import { SingleFlightOAuth } from './single-flight-oauth';

export interface GoogleAccountConnector {
  connect(
    authorization: GoogleAuthorization,
    loginHint: string | undefined,
    signal: AbortSignal,
  ): Promise<MailAccount>;
}

export class GoogleOAuthCoordinator {
  constructor(
    private readonly flow: GoogleLoopbackFlow,
    private readonly localConnector: GoogleAccountConnector,
    private readonly flights: SingleFlightOAuth = new SingleFlightOAuth(),
  ) {}

  authorize(input: GoogleAuthorizeInput): Promise<GoogleAuthorizeOutput> {
    return this.flights.run((signal) => this.run(input, signal));
  }

  cancel(): void {
    this.flights.cancel();
  }

  shutdown(): Promise<void> {
    return this.flights.shutdown();
  }

  private async run(
    input: GoogleAuthorizeInput,
    signal: AbortSignal,
  ): Promise<GoogleAuthorizeOutput> {
    const authorization = await this.flow.authorize({
      signal,
      scopes: googleScopesFor({ mail: true, calendar: input.calendar === true }),
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
      account: await this.localConnector.connect(authorization, input.loginHint, signal),
    };
  }
}
