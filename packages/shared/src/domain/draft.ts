import { z } from 'zod';
import { AddressSchema } from './address';
import {
  AccountIdSchema,
  AttachmentIdSchema,
  DraftIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
} from './ids';
import { IsoDateTimeSchema } from './primitives';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const DraftAttachmentSchema = z.object({
  id: AttachmentIdSchema,
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  size: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
});
export type DraftAttachment = z.infer<typeof DraftAttachmentSchema>;

export const DraftContentSchema = z.object({
  accountId: AccountIdSchema,
  to: z.array(AddressSchema),
  cc: z.array(AddressSchema),
  bcc: z.array(AddressSchema),
  subject: z.string().max(998),
  body: z.string(),
  inReplyToThreadId: ThreadIdSchema.nullable(),
  inReplyToMessageId: MessageIdSchema.nullable(),
  attachments: z.array(DraftAttachmentSchema).max(50).default([]),
});
export type DraftContent = z.infer<typeof DraftContentSchema>;

export const DraftSchema = DraftContentSchema.extend({
  id: DraftIdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Draft = z.infer<typeof DraftSchema>;
