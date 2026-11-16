import type { AttachmentId } from '@relay/shared/domain';

export interface AttachmentReferenceRepository {
  findReferenced(ids: readonly AttachmentId[]): Promise<AttachmentId[]>;
}
