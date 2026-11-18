import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import { IsoDateTimeSchema } from '../domain/primitives';
import { invokeChannel, streamChannel } from './define';

export const UpdateVersionSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);

export const UpdateDisabledReasonSchema = z.enum([
  'development',
  'unsupported-platform',
  'manual-package',
]);
export type UpdateDisabledReason = z.infer<typeof UpdateDisabledReasonSchema>;

export const UpdateStatusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('disabled'), reason: UpdateDisabledReasonSchema }),
  z.object({ kind: z.literal('idle') }),
  z.object({ kind: z.literal('checking') }),
  z.object({ kind: z.literal('current'), checkedAt: IsoDateTimeSchema }),
  z.object({
    kind: z.literal('downloading'),
    version: UpdateVersionSchema,
    percent: z.number().int().min(0).max(100),
  }),
  z.object({ kind: z.literal('ready'), version: UpdateVersionSchema }),
  z.object({ kind: z.literal('installing'), version: UpdateVersionSchema }),
  z.object({ kind: z.literal('error'), failed: z.enum(['check', 'download', 'install']) }),
]);
export type UpdateStatus = z.infer<typeof UpdateStatusSchema>;

export const updateInvokeChannels = {
  'app.update.status': invokeChannel(z.undefined(), UpdateStatusSchema),
  'app.update.check': invokeChannel(z.undefined(), OkResponseSchema),
  'app.update.install': invokeChannel(z.undefined(), OkResponseSchema),
};

export const updateStreamChannels = {
  'app.update.events': streamChannel(z.undefined(), UpdateStatusSchema),
};
