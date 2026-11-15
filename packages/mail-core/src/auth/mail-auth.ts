export type MailAuth =
  | { readonly kind: 'password'; readonly user: string; readonly password: string }
  | { readonly kind: 'oauth2'; readonly user: string; readonly accessToken: string };

export interface MailAuthResolver {
  resolve(): Promise<MailAuth>;
}
