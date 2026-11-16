import { type Clock, ReauthorizationRequiredError } from '@relay/engine';
import type { CalendarConnectionId } from '@relay/shared/domain';
import type { OAuthTokenRefresher } from '../oauth-token-provider';
import { type KeyedCredentialStore, RefreshingOAuthTokens } from '../refreshing-oauth-tokens';
import { GoogleTokenRejectedError } from './google-token-endpoint';

export interface CalendarAccessTokenSource {
  accessToken(connectionId: CalendarConnectionId): Promise<string>;
}

export interface GoogleCalendarAccessTokensOptions {
  readonly refresher: OAuthTokenRefresher;
  readonly store: KeyedCredentialStore<CalendarConnectionId>;
  readonly clock: Clock;
}

export class GoogleCalendarAccessTokens implements CalendarAccessTokenSource {
  private readonly tokens: RefreshingOAuthTokens<CalendarConnectionId>;

  constructor(private readonly options: GoogleCalendarAccessTokensOptions) {
    this.tokens = new RefreshingOAuthTokens({
      refreshers: { gmail: options.refresher },
      store: options.store,
      clock: options.clock,
    });
  }

  async accessToken(connectionId: CalendarConnectionId): Promise<string> {
    const stored = await this.options.store.get(connectionId);
    if (stored?.kind !== 'oauth') {
      throw new ReauthorizationRequiredError('No Google calendar credentials are stored');
    }
    return this.tokens.accessToken(connectionId, stored).catch((error: unknown) => {
      if (error instanceof GoogleTokenRejectedError) {
        throw new ReauthorizationRequiredError(error.message, { cause: error });
      }
      throw error;
    });
  }
}
