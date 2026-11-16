import { z } from 'zod';
import {
  AttachmentContentTypeSchema,
  AttachmentFilenameSchema,
} from '../../domain/attachment-file';
import { DraftAttachmentSchema, DraftSchema } from '../../domain/draft';
import { AttachmentIdSchema, DraftIdSchema, MessageIdSchema } from '../../domain/ids';
import { idParamsOf } from '../common';
import { defineEndpoint } from '../endpoint';

export const DRAFT_ATTACHMENT_UPLOAD_CONTENT_TYPE = 'application/octet-stream';

export const DraftAttachmentFileQuerySchema = z.object({
  filename: AttachmentFilenameSchema,
  contentType: AttachmentContentTypeSchema,
});
export type DraftAttachmentFileQuery = z.infer<typeof DraftAttachmentFileQuerySchema>;

export const DraftAttachmentAddedSchema = z.object({
  draft: DraftSchema,
  attachment: DraftAttachmentSchema,
});
export type DraftAttachmentAdded = z.infer<typeof DraftAttachmentAddedSchema>;

export const DraftAttachmentsForwardedSchema = z.object({
  draft: DraftSchema,
  attachments: z.array(DraftAttachmentSchema),
});
export type DraftAttachmentsForwarded = z.infer<typeof DraftAttachmentsForwardedSchema>;

export const ForwardAttachmentsBodySchema = z.object({ messageId: MessageIdSchema });
export type ForwardAttachmentsBody = z.infer<typeof ForwardAttachmentsBodySchema>;

export const draftAttachmentsEndpoints = {
  add: defineEndpoint({
    method: 'POST',
    path: '/drafts/:id/attachments',
    auth: 'user',
    params: idParamsOf(DraftIdSchema),
    query: DraftAttachmentFileQuerySchema,
    response: DraftAttachmentAddedSchema,
  }),
  remove: defineEndpoint({
    method: 'DELETE',
    path: '/drafts/:id/attachments/:attachmentId',
    auth: 'user',
    params: z.object({ id: DraftIdSchema, attachmentId: AttachmentIdSchema }),
    response: DraftSchema,
  }),
  forward: defineEndpoint({
    method: 'POST',
    path: '/drafts/:id/forwarded-attachments',
    auth: 'user',
    params: idParamsOf(DraftIdSchema),
    body: ForwardAttachmentsBodySchema,
    response: DraftAttachmentsForwardedSchema,
  }),
};
