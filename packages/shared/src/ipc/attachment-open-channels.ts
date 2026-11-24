import { z } from 'zod';
import { OkResponseSchema } from '../api/common';
import { AttachmentFilenameSchema } from '../domain/attachment-file';
import { invokeChannel } from './define';

export const MAX_OPENED_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export const OpenAttachmentInputSchema = z.object({
  filename: AttachmentFilenameSchema,
  content: z
    .instanceof(Uint8Array)
    .refine(
      (bytes) => bytes.byteLength <= MAX_OPENED_ATTACHMENT_BYTES,
      'Súbor je väčší ako 100 MB',
    ),
});
export type OpenAttachmentInput = z.infer<typeof OpenAttachmentInputSchema>;

export const attachmentOpenInvokeChannels = {
  'app.attachments.open': invokeChannel(OpenAttachmentInputSchema, OkResponseSchema),
  'app.attachments.quickLook': invokeChannel(OpenAttachmentInputSchema, OkResponseSchema),
};
