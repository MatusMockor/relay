import type { Device } from '@relay/shared/domain';
import type { devices } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

type DeviceRow = typeof devices.$inferSelect;
type DeviceInsert = typeof devices.$inferInsert;

export const toDevice = (row: DeviceRow): Device => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  platform: row.platform,
  createdAt: toIso(row.createdAt),
  lastSeenAt: toIso(row.lastSeenAt),
});

export const toDeviceInsert = (device: Device): DeviceInsert => ({
  id: device.id,
  userId: device.userId,
  name: device.name,
  platform: device.platform,
  createdAt: toDate(device.createdAt),
  lastSeenAt: toDate(device.lastSeenAt),
});
