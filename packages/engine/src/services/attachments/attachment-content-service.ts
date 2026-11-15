import type { AttachmentId, UserId } from '@relay/shared/domain';
import { NotFoundError } from '../../errors';
import type { AttachmentContent } from '../../model/attachment';
import type { AttachmentStore } from '../../ports/attachment-store';
import type { ReceivedAttachmentReader } from './received-attachment-reader';

export class AttachmentContentService {
  constructor(
    private readonly store: AttachmentStore,
    private readonly received: ReceivedAttachmentReader | null,
  ) {}

  async content(userId: UserId, attachmentId: AttachmentId): Promise<AttachmentContent> {
    const uploaded = await this.store.get(userId, attachmentId);
    if (uploaded !== null) {
      return {
        filename: uploaded.attachment.filename,
        contentType: uploaded.attachment.contentType,
        content: uploaded.content,
      };
    }
    const received = (await this.received?.read(userId, attachmentId)) ?? null;
    if (received === null) {
      throw new NotFoundError('Attachment', attachmentId);
    }
    return received;
  }
}
