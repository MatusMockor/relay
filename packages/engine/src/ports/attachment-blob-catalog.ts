import type { AttachmentId } from '@relay/shared/domain';

export interface StoredAttachmentBlob {
  readonly id: AttachmentId;
  readonly createdAt: string;
}

export interface AttachmentBlobQuery {
  readonly createdBefore: string;
  readonly after: AttachmentId | null;
  readonly limit: number;
}

export interface AttachmentBlobCatalog {
  listCreatedBefore(query: AttachmentBlobQuery): Promise<StoredAttachmentBlob[]>;
  deleteUnreferenced(ids: readonly AttachmentId[]): Promise<AttachmentId[]>;
}
