import { z } from 'zod';
import { OAuthProviderKindSchema } from './account';
import { IsoDateTimeSchema } from './primitives';

export const PasswordCredentialsSchema = z.object({
  kind: z.literal('password'),
  password: z.string().min(1),
});
export type PasswordCredentials = z.infer<typeof PasswordCredentialsSchema>;

export const OAuthCredentialsSchema = z.object({
  kind: z.literal('oauth'),
  provider: OAuthProviderKindSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: IsoDateTimeSchema,
  scope: z.string().nullable(),
});
export type OAuthCredentials = z.infer<typeof OAuthCredentialsSchema>;

export const AccountCredentialsSchema = z.discriminatedUnion('kind', [
  PasswordCredentialsSchema,
  OAuthCredentialsSchema,
]);
export type AccountCredentials = z.infer<typeof AccountCredentialsSchema>;
