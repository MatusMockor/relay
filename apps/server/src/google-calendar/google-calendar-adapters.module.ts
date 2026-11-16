import { Global, Module } from '@nestjs/common';
import { HttpGoogleCalendarGateway, IcalCalendarParser } from '@relay/calendar';
import {
  type Clock,
  type GoogleCalendarAdapters,
  PORT_TOKENS,
  unconfiguredGoogleCalendar,
} from '@relay/engine';
import { GoogleCalendarAccessTokens, GoogleOAuthTokenRefresher } from '@relay/mail-core';
import { SERVER_CONFIG, type ServerConfig } from '../config/server-config';
import { toGoogleClientConfig } from '../mail/google-client-config';
import { GOOGLE_CALENDAR_CREDENTIALS } from '../persistence';
import type { AesGcmGoogleCalendarCredentials } from '../persistence/credentials/aes-gcm-google-calendar-credentials';

export const SERVER_GOOGLE_SETUP_HINT =
  'Google kalendár nie je na serveri nastavený. Správca servera musí nastaviť premenné prostredia GOOGLE_OAUTH_CLIENT_ID a GOOGLE_OAUTH_CLIENT_SECRET (rovnaký Google OAuth klient ako v aplikácii) a reštartovať server.';

const createAdapters = (
  config: ServerConfig,
  credentials: AesGcmGoogleCalendarCredentials,
  clock: Clock,
): GoogleCalendarAdapters => {
  if (config.google === null) {
    return unconfiguredGoogleCalendar(SERVER_GOOGLE_SETUP_HINT);
  }
  const tokens = new GoogleCalendarAccessTokens({
    refresher: new GoogleOAuthTokenRefresher(toGoogleClientConfig(config.google), clock),
    store: credentials,
    clock,
  });
  return {
    gateway: new HttpGoogleCalendarGateway({
      tokens,
      parser: new IcalCalendarParser(),
      ...(config.calendar.googleApiUrl === null ? {} : { baseUrl: config.calendar.googleApiUrl }),
    }),
    credentials,
    setup: { setup: () => Promise.resolve({ configured: true, setupHint: null }) },
  };
};

@Global()
@Module({
  providers: [
    {
      provide: PORT_TOKENS.GoogleCalendarAdapters,
      inject: [SERVER_CONFIG, GOOGLE_CALENDAR_CREDENTIALS, PORT_TOKENS.Clock],
      useFactory: createAdapters,
    },
  ],
  exports: [PORT_TOKENS.GoogleCalendarAdapters],
})
export class GoogleCalendarAdaptersModule {}
