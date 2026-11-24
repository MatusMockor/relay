import type { AttachmentId, AttachmentMeta } from '@relay/shared';
import type { BlobLoader } from '../use-blob-action';

export class AttachmentBlobCache {
  private readonly entries = new Map<AttachmentId, Promise<Blob>>();

  constructor(private readonly loadBlob: BlobLoader) {}

  readonly load: BlobLoader = (attachment: AttachmentMeta) => {
    const cached = this.entries.get(attachment.id);
    if (cached !== undefined) {
      return cached;
    }
    const pending = this.loadBlob(attachment);
    this.entries.set(attachment.id, pending);
    pending.catch(() => {
      if (this.entries.get(attachment.id) === pending) {
        this.entries.delete(attachment.id);
      }
    });
    return pending;
  };
}
