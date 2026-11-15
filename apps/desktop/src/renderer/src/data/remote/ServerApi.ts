import {
  api,
  type AuthSession,
  type DeviceId,
  type DeviceRegistration,
  type DeviceView,
  type HealthResponse,
  type MeResponse,
} from '@relay/shared';
import { HttpApi, type FetchLike } from './HttpApi';
import { NO_SESSION, type SessionTokens } from './SessionTokens';

export interface Credentials {
  readonly email: string;
  readonly password: string;
}

export interface Registration extends Credentials {
  readonly displayName: string;
}

export const normalizeServerUrl = (input: string): string => {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

export const checkServerHealth = (
  baseUrl: string,
  fetchImpl?: FetchLike,
): Promise<HealthResponse> =>
  new HttpApi({ baseUrl, session: NO_SESSION, fetch: fetchImpl }).call(api.health.get, {});

export class ServerApi {
  constructor(
    private readonly http: HttpApi,
    private readonly tokens: SessionTokens,
  ) {}

  async register(input: Registration, device: DeviceRegistration): Promise<AuthSession> {
    const session = await this.http.call(api.auth.register, { body: { ...input, device } });
    await this.tokens.save(session);
    return session;
  }

  async login(input: Credentials, device: DeviceRegistration): Promise<AuthSession> {
    const session = await this.http.call(api.auth.login, { body: { ...input, device } });
    await this.tokens.save(session);
    return session;
  }

  async logout(): Promise<void> {
    await this.http.call(api.auth.logout, {}).catch(() => undefined);
    await this.tokens.clear();
  }

  me(): Promise<MeResponse> {
    return this.http.call(api.auth.me, {});
  }

  listDevices(): Promise<DeviceView[]> {
    return this.http.call(api.devices.list, {});
  }

  async revokeDevice(deviceId: DeviceId): Promise<void> {
    await this.http.call(api.devices.revoke, { params: { id: deviceId } });
  }

  async hasSession(): Promise<boolean> {
    return this.tokens.hasSession();
  }
}
