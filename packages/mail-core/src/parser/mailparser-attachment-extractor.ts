import type { AttachmentContent, AttachmentExtractor } from '@relay/engine';
import { extractAttachment } from './extract-attachment';

export class MailparserAttachmentExtractor implements AttachmentExtractor {
  extract(source: Uint8Array, index: number): Promise<AttachmentContent | null> {
    return extractAttachment(source, index);
  }
}
