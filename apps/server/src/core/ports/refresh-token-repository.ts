import type { DeviceId } from '@relay/shared/domain';
import type { NewRefreshToken, RefreshTokenRecord } from '../model/refresh-token';

export interface RefreshTokenRepository {
  store(token: NewRefreshToken): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  findValid(tokenHash: string, now: string): Promise<RefreshTokenRecord | null>;
  rotate(currentId: string, next: NewRefreshToken, now: string): Promise<RefreshTokenRecord | null>;
  revokeFamily(familyId: string, revokedAt: string): Promise<void>;
  revokeDevice(deviceId: DeviceId, revokedAt: string): Promise<void>;
}
