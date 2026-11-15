import type { AttachmentContent } from '../model/attachment';

export interface AttachmentExtractor {
  extract(source: Uint8Array, index: number): Promise<AttachmentContent | null>;
}
