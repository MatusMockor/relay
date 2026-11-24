import { z } from 'zod';
import { AddressSchema } from './address';
import {
  AccountIdSchema,
  AttachmentIdSchema,
  LabelIdSchema,
  MailboxIdSchema,
  MessageIdSchema,
  ThreadIdSchema,
} from './ids';
import { IsoDateTimeSchema } from './primitives';

export const MessageFlagsSchema = z.object({
  seen: z.boolean(),
  flagged: z.boolean(),
  answered: z.boolean(),
});
export type MessageFlags = z.infer<typeof MessageFlagsSchema>;

export const AttachmentMetaSchema = z.object({
  id: AttachmentIdSchema,
  filename: z.string().nullable(),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  contentId: z.string().nullable(),
  inline: z.boolean(),
});
export type AttachmentMeta = z.infer<typeof AttachmentMetaSchema>;

export const MessageBodyStateSchema = z.enum(['local', 'remote']);
export type MessageBodyState = z.infer<typeof MessageBodyStateSchema>;

export const MessagePlacementSchema = z.object({
  mailboxId: MailboxIdSchema,
  uid: z.number().int().nonnegative(),
});
export type MessagePlacement = z.infer<typeof MessagePlacementSchema>;

const MessageFieldsSchema = z.object({
  id: MessageIdSchema,
  threadId: ThreadIdSchema,
  accountId: AccountIdSchema,
  mailboxId: MailboxIdSchema,
  uid: z.number().int().nonnegative(),
  messageIdHeader: z.string().nullable(),
  emailId: z.string().min(1).nullable(),
  inReplyTo: z.string().nullable(),
  references: z.array(z.string()),
  from: AddressSchema.nullable(),
  to: z.array(AddressSchema),
  cc: z.array(AddressSchema),
  bcc: z.array(AddressSchema),
  replyTo: z.array(AddressSchema),
  subject: z.string(),
  date: IsoDateTimeSchema,
  snippet: z.string(),
  textBody: z.string().nullable(),
  htmlBody: z.string().nullable(),
  flags: MessageFlagsSchema,
  labelIds: z.array(LabelIdSchema),
  attachments: z.array(AttachmentMetaSchema),
  bodyState: MessageBodyStateSchema.optional(),
  placements: z.array(MessagePlacementSchema).min(1).optional(),
});

export const MessageSchema = MessageFieldsSchema.transform((message) => ({
  ...message,
  placements: message.placements ?? [{ mailboxId: message.mailboxId, uid: message.uid }],
}));
export type Message = z.infer<typeof MessageSchema>;

export const isBodyLocal = (message: Pick<Message, 'bodyState'>): boolean =>
  message.bodyState !== 'remote';
