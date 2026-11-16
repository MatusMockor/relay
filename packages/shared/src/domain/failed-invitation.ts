import { z } from 'zod';
import { AddressSchema } from './address';
import { AccountIdSchema, MessageIdSchema, ThreadIdSchema } from './ids';
import { EmailAddressSchema, IsoDateTimeSchema } from './primitives';

export const FailedInvitationRefSchema = z.object({
  accountId: AccountIdSchema,
  messageId: MessageIdSchema,
});
export type FailedInvitationRef = z.infer<typeof FailedInvitationRefSchema>;

export const FailedInvitationSchema = FailedInvitationRefSchema.extend({
  accountEmail: EmailAddressSchema,
  threadId: ThreadIdSchema,
  subject: z.string().nullable(),
  from: AddressSchema.nullable(),
  date: IsoDateTimeSchema.nullable(),
  attempts: z.number().int().nonnegative(),
  failedAt: IsoDateTimeSchema,
  lastError: z.string().nullable(),
});
export type FailedInvitation = z.infer<typeof FailedInvitationSchema>;

export const FailedInvitationRetrySchema = z.object({ applied: z.boolean() });
export type FailedInvitationRetry = z.infer<typeof FailedInvitationRetrySchema>;
