import { z } from 'zod';

export const GoogleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string(),
  scope: z.string().optional(),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
});
export type GoogleTokenResponse = z.infer<typeof GoogleTokenResponseSchema>;

export const GoogleTokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

export const GoogleIdTokenClaimsSchema = z.object({
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  sub: z.string().optional(),
});
