import { z } from 'zod';
import { DeviceIdSchema, UserIdSchema } from './ids';
import { IsoDateTimeSchema } from './primitives';

export const DevicePlatformSchema = z.enum(['macos', 'linux', 'windows']);
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

export const DeviceSchema = z.object({
  id: DeviceIdSchema,
  userId: UserIdSchema,
  name: z.string().min(1).max(200),
  platform: DevicePlatformSchema,
  createdAt: IsoDateTimeSchema,
  lastSeenAt: IsoDateTimeSchema,
});
export type Device = z.infer<typeof DeviceSchema>;

export const DeviceRegistrationSchema = DeviceSchema.pick({ name: true, platform: true });
export type DeviceRegistration = z.infer<typeof DeviceRegistrationSchema>;
