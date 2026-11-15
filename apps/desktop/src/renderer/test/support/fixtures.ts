import {
  type AuthSession,
  DeviceSchema,
  type MeResponse,
  type TokenPair,
  UserSchema,
} from '@relay/shared';

const STAMP = '2026-11-15T08:00:00.000Z';

export const TEST_USER = UserSchema.parse({
  id: 'user-1',
  email: 'jan@domov.sk',
  displayName: 'Ján Novák',
  createdAt: STAMP,
});
export const TEST_DEVICE = DeviceSchema.parse({
  id: 'device-1',
  userId: 'user-1',
  name: 'Prehliadač (Linux)',
  platform: 'linux',
  createdAt: STAMP,
  lastSeenAt: STAMP,
});
export const TEST_ME: MeResponse = { user: TEST_USER, device: TEST_DEVICE };

export const tokens = (
  access: string,
  refresh = `refresh-${access}`,
  expiresAt = '2099-01-01T00:00:00.000Z',
): TokenPair => ({
  accessToken: access,
  accessTokenExpiresAt: expiresAt,
  refreshToken: refresh,
});

export const session = (access: string): AuthSession => ({
  ...tokens(access),
  user: TEST_USER,
  device: TEST_DEVICE,
});
