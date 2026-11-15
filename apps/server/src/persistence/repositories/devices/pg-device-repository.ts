import type { Device, DeviceId, UserId } from '@relay/shared/domain';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { DeviceRepository } from '../../../core/ports/device-repository';
import type { DbExecutor } from '../../database/database';
import { devices } from '../../schema';
import { toDate } from '../../support/timestamps';
import { toDevice, toDeviceInsert } from './device.mapper';

export class PgDeviceRepository implements DeviceRepository {
  constructor(private readonly db: DbExecutor) {}

  async create(device: Device): Promise<Device> {
    const [row] = await this.db.insert(devices).values(toDeviceInsert(device)).returning();
    return row === undefined ? device : toDevice(row);
  }

  async findActive(userId: UserId, deviceId: DeviceId): Promise<Device | null> {
    const [row] = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId), isNull(devices.revokedAt)));
    return row === undefined ? null : toDevice(row);
  }

  async listForUser(userId: UserId): Promise<Device[]> {
    const rows = await this.db
      .select()
      .from(devices)
      .where(and(eq(devices.userId, userId), isNull(devices.revokedAt)))
      .orderBy(desc(devices.lastSeenAt), desc(devices.id));
    return rows.map(toDevice);
  }

  async touch(deviceId: DeviceId, lastSeenAt: string): Promise<void> {
    await this.db
      .update(devices)
      .set({ lastSeenAt: toDate(lastSeenAt) })
      .where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)));
  }

  async revoke(userId: UserId, deviceId: DeviceId, revokedAt: string): Promise<boolean> {
    const rows = await this.db
      .update(devices)
      .set({ revokedAt: toDate(revokedAt) })
      .where(and(eq(devices.id, deviceId), eq(devices.userId, userId), isNull(devices.revokedAt)))
      .returning({ id: devices.id });
    return rows.length > 0;
  }
}
