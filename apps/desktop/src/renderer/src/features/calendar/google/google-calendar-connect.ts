import { EmailAddressSchema, type GoogleCalendarConnection } from '@relay/shared';
import { MailClientError } from '../../../data/errors';
import type { Platform } from '../../../platform/Platform';
import type { AppServices } from '../../../session/services';

const SERVER_MESSAGES: Partial<Record<MailClientError['code'], string>> = {
  forbidden:
    'Server nemá nastavený Google kalendár. Na serveri nastav GOOGLE_OAUTH_CLIENT_ID a GOOGLE_OAUTH_CLIENT_SECRET rovnakého Google OAuth klienta, aký používa táto aplikácia.',
  provider_error:
    'Server nedokázal overiť prihlásenie u Googlu. Skontroluj, či server aj táto aplikácia používajú rovnaký Google OAuth klient.',
};

const explainServerError = (error: unknown): never => {
  if (!(error instanceof MailClientError)) {
    throw error;
  }
  const message = SERVER_MESSAGES[error.code];
  if (message === undefined) {
    throw error;
  }
  throw new MailClientError({ code: error.code, message }, error.status);
};

const failure = (code: MailClientError['code'], message: string) =>
  new MailClientError({ code, message });

export const connectGoogleCalendar = async (
  services: AppServices,
  platform: Platform,
  loginHint: string | undefined,
  isCancelled: () => boolean,
): Promise<GoogleCalendarConnection> => {
  if (services.mode === 'demo') {
    throw failure('not_implemented', 'V ukážkovom režime sa Google kalendár nedá pripojiť.');
  }
  const hint = EmailAddressSchema.safeParse(loginHint);
  const result = await platform.authorizeGoogleCalendar({
    mode: services.mode,
    ...(hint.success ? { loginHint: hint.data } : {}),
  });
  if (result.mode === 'local' && services.mode === 'local') {
    return result.connection;
  }
  if (result.mode !== 'synced' || services.mode !== 'synced') {
    throw failure('internal', 'Prihlásenie cez Google vrátilo neočakávanú odpoveď');
  }
  if (isCancelled()) {
    throw failure('validation_failed', 'Prihlásenie cez Google bolo zrušené');
  }
  return services.client.connectGoogleCalendar(result.grant).catch(explainServerError);
};
