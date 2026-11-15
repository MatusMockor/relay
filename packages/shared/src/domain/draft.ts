import { z } from 'zod';
import { AddressSchema } from './address';
import { AccountIdSchema, DraftIdSchema, MessageIdSchema, ThreadIdSchema } from './ids';
import { IsoDateTimeSchema } from './primitives';

export const DraftContentSchema = z.object({
  accountId: AccountIdSchema,
  to: z.array(AddressSchema),
  cc: z.array(AddressSchema),
  bcc: z.array(AddressSchema),
  subject: z.string().max(998),
  body: z.string(),
  inReplyToThreadId: ThreadIdSchema.nullable(),
  inReplyToMessageId: MessageIdSchema.nullable(),
});
export type DraftContent = z.infer<typeof DraftContentSchema>;

export const DraftSchema = DraftContentSchema.extend({
  id: DraftIdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Draft = z.infer<typeof DraftSchema>;
