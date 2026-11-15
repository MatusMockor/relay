import type { DeviceId, UserId } from '@relay/shared/domain';

export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: UserId;
  readonly deviceId: DeviceId;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly rotatedAt: string | null;
  readonly revokedAt: string | null;
}

export type NewRefreshToken = Omit<RefreshTokenRecord, 'rotatedAt' | 'revokedAt'>;
