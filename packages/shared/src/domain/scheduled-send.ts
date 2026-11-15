import { z } from 'zod';
import { AccountIdSchema, DraftIdSchema, ScheduledSendIdSchema, UserIdSchema } from './ids';
import { IsoDateTimeSchema } from './primitives';

export const ScheduledSendStatusSchema = z.enum([
  'pending',
  'sending',
  'sent',
  'cancelled',
  'failed',
]);
export type ScheduledSendStatus = z.infer<typeof ScheduledSendStatusSchema>;

export const ScheduledSendSchema = z.object({
  id: ScheduledSendIdSchema,
  userId: UserIdSchema,
  accountId: AccountIdSchema,
  draftId: DraftIdSchema,
  scheduledAt: IsoDateTimeSchema,
  status: ScheduledSendStatusSchema,
  error: z.string().nullable(),
  sentAt: IsoDateTimeSchema.nullable(),
  createdAt: IsoDateTimeSchema,
});
export type ScheduledSend = z.infer<typeof ScheduledSendSchema>;
