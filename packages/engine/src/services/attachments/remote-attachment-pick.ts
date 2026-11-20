import type { AttachmentMeta } from '@relay/shared/domain';
import type { AttachmentContent } from '../../model/attachment';

const sameAttachment = (candidate: AttachmentContent, meta: AttachmentMeta): boolean =>
  candidate.filename === meta.filename &&
  candidate.contentType.toLowerCase() === meta.contentType.toLowerCase();

export const pickRemoteAttachment = (
  candidates: readonly AttachmentContent[],
  index: number,
  meta: AttachmentMeta,
): AttachmentContent | null => {
  const atIndex = candidates[index];
  if (atIndex !== undefined && sameAttachment(atIndex, meta)) {
    return atIndex;
  }
  return candidates.find((candidate) => sameAttachment(candidate, meta)) ?? null;
};
