import { api, type AuthSession } from '@relay/shared/api';
import type { DevicePlatform } from '@relay/shared/domain';
import type { ApiClient } from './api-client';

export const TEST_PASSWORD = 'correct horse battery staple';

export const registerUser = (
  client: ApiClient,
  email: string,
  deviceName = 'MacBook',
  platform: DevicePlatform = 'macos',
): Promise<AuthSession> =>
  client.ok(api.auth.register, {
    body: {
      email,
      password: TEST_PASSWORD,
      displayName: 'Test User',
      device: { name: deviceName, platform },
    },
  });

export const loginUser = (
  client: ApiClient,
  email: string,
  deviceName = 'Linux desktop',
): Promise<AuthSession> =>
  client.ok(api.auth.login, {
    body: { email, password: TEST_PASSWORD, device: { name: deviceName, platform: 'linux' } },
  });
