import { GOOGLE_AUTH_ENDPOINT, GOOGLE_MAIL_SCOPES } from './google-oauth-config';

export interface GoogleAuthUrlInput {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly state: string;
  readonly loginHint?: string;
  readonly authEndpoint?: string;
}

export const buildGoogleAuthUrl = (input: GoogleAuthUrlInput): string => {
  const url = new URL(input.authEndpoint ?? GOOGLE_AUTH_ENDPOINT);
  const params = url.searchParams;
  params.set('client_id', input.clientId);
  params.set('redirect_uri', input.redirectUri);
  params.set('response_type', 'code');
  params.set('scope', GOOGLE_MAIL_SCOPES.join(' '));
  params.set('code_challenge', input.codeChallenge);
  params.set('code_challenge_method', 'S256');
  params.set('state', input.state);
  params.set('access_type', 'offline');
  params.set('prompt', 'consent');
  if (input.loginHint) {
    params.set('login_hint', input.loginHint);
  }
  return url.toString();
};
