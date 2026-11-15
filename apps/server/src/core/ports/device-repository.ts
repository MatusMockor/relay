import type { Device, DeviceId, UserId } from '@relay/shared/domain';

export interface DeviceRepository {
  create(device: Device): Promise<Device>;
  findActive(userId: UserId, deviceId: DeviceId): Promise<Device | null>;
  listForUser(userId: UserId): Promise<Device[]>;
  touch(deviceId: DeviceId, lastSeenAt: string): Promise<void>;
  revoke(userId: UserId, deviceId: DeviceId, revokedAt: string): Promise<boolean>;
}
