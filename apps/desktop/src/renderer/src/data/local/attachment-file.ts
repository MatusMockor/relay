import type { LocalAttachmentContent } from '@relay/shared';
import type { AttachmentFile } from '../MailClient';

const decodeBase64 = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const attachmentFileOf = (content: LocalAttachmentContent): AttachmentFile => ({
  contentType: content.contentType,
  blob: new Blob([decodeBase64(content.contentBase64)], { type: content.contentType }),
});
