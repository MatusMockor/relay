import type { AttachmentId, DraftAttachment, UserId } from '@relay/shared/domain';
import type { AttachmentUpload } from '../model/attachment';

export interface StoredAttachment {
  readonly attachment: DraftAttachment;
  readonly content: Uint8Array;
}

export interface AttachmentStore {
  put(userId: UserId, upload: AttachmentUpload): Promise<DraftAttachment>;
  get(userId: UserId, attachmentId: AttachmentId): Promise<StoredAttachment | null>;
  delete(userId: UserId, attachmentId: AttachmentId): Promise<boolean>;
}
