import type { AttachmentId, Message, UserId } from '@relay/shared/domain';

export interface MessageAttachmentLookup {
  findByAttachmentId(userId: UserId, attachmentId: AttachmentId): Promise<Message | null>;
}
