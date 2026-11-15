import { z } from 'zod';
import { DeviceRegistrationSchema, DeviceSchema } from '../../domain/device';
import { EmailAddressSchema, IsoDateTimeSchema } from '../../domain/primitives';
import { UserSchema } from '../../domain/user';
import { OkResponseSchema } from '../common';
import { defineEndpoint } from '../endpoint';

export const PASSWORD_MIN_LENGTH = 8;

export const PasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(1_024);

export const RegisterBodySchema = z.object({
  email: EmailAddressSchema,
  password: PasswordSchema,
  displayName: z.string().trim().min(1).max(200),
  device: DeviceRegistrationSchema,
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z.object({
  email: EmailAddressSchema,
  password: z.string().min(1).max(1_024),
  device: DeviceRegistrationSchema,
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string().min(1),
  accessTokenExpiresAt: IsoDateTimeSchema,
  refreshToken: z.string().min(1),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

export const AuthSessionSchema = TokenPairSchema.extend({
  user: UserSchema,
  device: DeviceSchema,
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export const RefreshBodySchema = z.object({ refreshToken: z.string().min(1) });
export type RefreshBody = z.infer<typeof RefreshBodySchema>;

export const MeResponseSchema = z.object({ user: UserSchema, device: DeviceSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const authEndpoints = {
  register: defineEndpoint({
    method: 'POST',
    path: '/auth/register',
    auth: 'public',
    body: RegisterBodySchema,
    response: AuthSessionSchema,
  }),
  login: defineEndpoint({
    method: 'POST',
    path: '/auth/login',
    auth: 'public',
    body: LoginBodySchema,
    response: AuthSessionSchema,
  }),
  refresh: defineEndpoint({
    method: 'POST',
    path: '/auth/refresh',
    auth: 'public',
    body: RefreshBodySchema,
    response: TokenPairSchema,
  }),
  logout: defineEndpoint({
    method: 'POST',
    path: '/auth/logout',
    auth: 'user',
    response: OkResponseSchema,
  }),
  me: defineEndpoint({
    method: 'GET',
    path: '/me',
    auth: 'user',
    response: MeResponseSchema,
  }),
};
