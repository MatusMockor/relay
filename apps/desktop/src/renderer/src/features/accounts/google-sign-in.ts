import { EmailAddressSchema, type MailAccount, type OAuthGrant } from '@relay/shared';
import { MailClientError } from '../../data/errors';
import type { Platform } from '../../platform/Platform';
import type { AppServices } from '../../session/services';

const DEMO_GRANT: OAuthGrant = {
  code: 'demo',
  codeVerifier: null,
  redirectUri: 'http://127.0.0.1/oauth/demo',
};

const SERVER_MESSAGES: Partial<Record<MailClientError['code'], string>> = {
  forbidden:
    'Server nemá nastavené prihlásenie cez Google. Na serveri nastav GOOGLE_OAUTH_CLIENT_ID a GOOGLE_OAUTH_CLIENT_SECRET rovnakého Google OAuth klienta, aký používa táto aplikácia (RELAY_GOOGLE_CLIENT_ID alebo google-oauth.json).',
  not_implemented: 'Server zatiaľ nepodporuje pripojenie účtu Gmail.',
  provider_error:
    'Server nedokázal overiť prihlásenie u Googlu. Skontroluj, či server aj táto aplikácia používajú rovnaký Google OAuth klient.',
};

const unexpectedResult = () =>
  new MailClientError({
    code: 'internal',
    message: 'Prihlásenie cez Google vrátilo neočakávanú odpoveď',
  });

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

const cancelled = () =>
  new MailClientError({
    code: 'validation_failed',
    message: 'Prihlásenie cez Google bolo zrušené',
  });

const hintOf = (loginHint: string | undefined): { loginHint?: string } => {
  const parsed = EmailAddressSchema.safeParse(loginHint?.trim());
  return parsed.success ? { loginHint: parsed.data } : {};
};

export const signInWithGoogle = async (
  services: AppServices,
  platform: Platform,
  loginHint?: string,
  isCancelled: () => boolean = () => false,
): Promise<MailAccount> => {
  if (services.mode === 'demo') {
    return services.client.createAccount({ provider: 'gmail', oauth: DEMO_GRANT });
  }
  const result = await platform.authorizeGoogle({
    mode: services.mode,
    calendar: true,
    ...hintOf(loginHint),
  });
  if (result.mode === 'local' && services.mode === 'local') {
    return result.account;
  }
  if (result.mode !== 'synced' || services.mode !== 'synced') {
    throw unexpectedResult();
  }
  if (isCancelled()) {
    throw cancelled();
  }
  return services.client
    .createAccount({ provider: 'gmail', oauth: result.grant })
    .catch(explainServerError);
};
