import { z } from 'zod';
import { DraftAttachmentSchema, MAX_ATTACHMENT_BYTES } from '../../domain/draft';
import { defineEndpoint } from '../endpoint';

const MAX_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;

export const UploadAttachmentBodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  contentBase64: z.base64().max(MAX_BASE64_LENGTH),
});
export type UploadAttachmentBody = z.infer<typeof UploadAttachmentBodySchema>;

export const attachmentsEndpoints = {
  upload: defineEndpoint({
    method: 'POST',
    path: '/attachments',
    auth: 'user',
    body: UploadAttachmentBodySchema,
    response: DraftAttachmentSchema,
  }),
};
