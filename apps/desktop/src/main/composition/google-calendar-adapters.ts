import { HttpGoogleCalendarGateway, IcalCalendarParser } from '@relay/calendar';
import { type Clock, type GoogleCalendarAdapters, isEngineError } from '@relay/engine';
import { GoogleCalendarAccessTokens } from '@relay/mail-core';
import type { GoogleClientConfigSource } from '../oauth/google-client-config-source';
import { LazyGoogleTokenRefresher } from '../oauth/lazy-google-token-refresher';
import type { SecretStoreGoogleCalendarCredentials } from '../secure/secret-store-google-calendar-credentials';

export interface GoogleCalendarAdaptersInput {
  readonly configSource: GoogleClientConfigSource;
  readonly credentials: SecretStoreGoogleCalendarCredentials;
  readonly clock: Clock;
  readonly apiUrl?: string;
  readonly fetch?: typeof fetch;
}

const setupOf = async (configSource: GoogleClientConfigSource) => {
  try {
    await configSource.load();
    return { configured: true, setupHint: null };
  } catch (error) {
    if (isEngineError(error)) {
      return { configured: false, setupHint: error.message };
    }
    throw error;
  }
};

export const createGoogleCalendarAdapters = (
  input: GoogleCalendarAdaptersInput,
): GoogleCalendarAdapters => ({
  gateway: new HttpGoogleCalendarGateway({
    tokens: new GoogleCalendarAccessTokens({
      refresher: new LazyGoogleTokenRefresher(input.configSource, input.clock, input.fetch),
      store: input.credentials,
      clock: input.clock,
    }),
    parser: new IcalCalendarParser(),
    ...(input.apiUrl === undefined ? {} : { baseUrl: input.apiUrl }),
    ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
  }),
  credentials: input.credentials,
  setup: { setup: () => setupOf(input.configSource) },
});
