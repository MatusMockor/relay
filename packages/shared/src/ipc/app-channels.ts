import { z } from 'zod';
import {
  AiEventSchema,
  AiJobInputSchema,
  AiRunnerInfoSchema,
  AiRunnerKindSchema,
} from '../domain/ai';
import { DevicePlatformSchema } from '../domain/device';
import { DeviceSettingsPatchSchema, DeviceSettingsSchema } from '../domain/settings';
import { OkResponseSchema } from '../api/common';
import { invokeChannel, streamChannel } from './define';

export const AppInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: DevicePlatformSchema,
  electronVersion: z.string().min(1),
  isPackaged: z.boolean(),
});
export type AppInfo = z.infer<typeof AppInfoSchema>;

export const SecureKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);
export type SecureKey = z.infer<typeof SecureKeySchema>;

export const AiRunRequestSchema = z.object({
  input: AiJobInputSchema,
  runner: AiRunnerKindSchema.optional(),
});
export type AiRunRequest = z.infer<typeof AiRunRequestSchema>;

export const appInvokeChannels = {
  'app.getInfo': invokeChannel(z.undefined(), AppInfoSchema),
  'settings.device.get': invokeChannel(z.undefined(), DeviceSettingsSchema),
  'settings.device.set': invokeChannel(DeviceSettingsPatchSchema, DeviceSettingsSchema),
  'secure.get': invokeChannel(
    z.object({ key: SecureKeySchema }),
    z.object({ value: z.string().nullable() }),
  ),
  'secure.set': invokeChannel(
    z.object({ key: SecureKeySchema, value: z.string() }),
    OkResponseSchema,
  ),
  'secure.delete': invokeChannel(z.object({ key: SecureKeySchema }), OkResponseSchema),
  'ai.detectRunners': invokeChannel(z.undefined(), z.array(AiRunnerInfoSchema)),
};

export const appStreamChannels = {
  'ai.run': streamChannel(AiRunRequestSchema, AiEventSchema),
};
