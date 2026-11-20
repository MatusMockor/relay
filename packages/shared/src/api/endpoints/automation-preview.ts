import { z } from 'zod';
import { AddressSchema } from '../../domain/address';
import { AutomationSchema } from '../../domain/automation';
import { AccountIdSchema, ThreadIdSchema } from '../../domain/ids';
import { IsoDateTimeSchema } from '../../domain/primitives';

export const AUTOMATION_PREVIEW_DAYS = 30;
export const AUTOMATION_PREVIEW_SAMPLES = 5;

export const AutomationPreviewBodySchema = AutomationSchema.pick({
  accountId: true,
  match: true,
  conditions: true,
  exceptions: true,
});
export type AutomationPreviewBody = z.infer<typeof AutomationPreviewBodySchema>;

export const AutomationPreviewSampleSchema = z.object({
  accountId: AccountIdSchema,
  threadId: ThreadIdSchema,
  from: AddressSchema.nullable(),
  subject: z.string(),
  date: IsoDateTimeSchema,
});
export type AutomationPreviewSample = z.infer<typeof AutomationPreviewSampleSchema>;

export const AutomationPreviewResponseSchema = z.object({
  days: z.number().int().positive(),
  count: z.number().int().nonnegative(),
  truncated: z.boolean(),
  samples: z.array(AutomationPreviewSampleSchema).max(AUTOMATION_PREVIEW_SAMPLES),
});
export type AutomationPreviewResponse = z.infer<typeof AutomationPreviewResponseSchema>;
