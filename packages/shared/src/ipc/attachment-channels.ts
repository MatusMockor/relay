import { z } from 'zod';
import {
  DraftAttachmentAddedSchema,
  DraftAttachmentsForwardedSchema,
  ForwardAttachmentsBodySchema,
} from '../api/endpoints/draft-attachments';
import { AttachmentContentTypeSchema, AttachmentFilenameSchema } from '../domain/attachment-file';
import { DraftSchema, MAX_ATTACHMENT_BYTES } from '../domain/draft';
import { AttachmentIdSchema, DraftIdSchema } from '../domain/ids';
import { invokeChannel } from './define';

export const AttachmentBytesSchema = z
  .instanceof(Uint8Array)
  .refine((bytes) => bytes.byteLength <= MAX_ATTACHMENT_BYTES, 'Súbor je väčší ako 25 MB');

export const PickedFileSchema = z.object({
  filename: AttachmentFilenameSchema,
  contentType: AttachmentContentTypeSchema,
  content: AttachmentBytesSchema,
});
export type PickedFile = z.infer<typeof PickedFileSchema>;

export const RejectedFileReasonSchema = z.enum(['too_large', 'total_exceeded', 'unreadable']);
export type RejectedFileReason = z.infer<typeof RejectedFileReasonSchema>;

export const RejectedFileSchema = z.object({
  filename: z.string().min(1).max(1024),
  reason: RejectedFileReasonSchema,
});
export type RejectedFile = z.infer<typeof RejectedFileSchema>;

export const PickFilesInputSchema = z.object({
  budgetBytes: z.number().int().nonnegative().max(MAX_ATTACHMENT_BYTES),
});
export type PickFilesInput = z.infer<typeof PickFilesInputSchema>;

export const PickedFilesSchema = z.object({
  files: z.array(PickedFileSchema),
  rejected: z.array(RejectedFileSchema),
});
export type PickedFiles = z.infer<typeof PickedFilesSchema>;

export const attachmentInvokeChannels = {
  'app.pickAttachments': invokeChannel(PickFilesInputSchema, PickedFilesSchema),
  'local.drafts.attachments.add': invokeChannel(
    PickedFileSchema.extend({ draftId: DraftIdSchema }),
    DraftAttachmentAddedSchema,
  ),
  'local.drafts.attachments.remove': invokeChannel(
    z.object({ draftId: DraftIdSchema, attachmentId: AttachmentIdSchema }),
    DraftSchema,
  ),
  'local.drafts.attachments.forward': invokeChannel(
    ForwardAttachmentsBodySchema.extend({ draftId: DraftIdSchema }),
    DraftAttachmentsForwardedSchema,
  ),
};
