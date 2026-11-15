export const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_MAIL_SCOPES = ['https://mail.google.com/', 'openid', 'email'] as const;

export interface GoogleOAuthClientConfig {
  readonly clientId: string;
  readonly clientSecret: string | null;
  readonly tokenEndpoint?: string;
}
