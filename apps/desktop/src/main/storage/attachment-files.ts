import { join } from 'node:path';
import { type AttachmentId, AttachmentIdSchema } from '@relay/shared/domain';

const CONTENT_SUFFIX = '.bin';
const META_SUFFIX = '.json';

export interface AttachmentFilePaths {
  readonly content: string;
  readonly meta: string;
}

export const attachmentFilePaths = (
  directory: string,
  attachmentId: AttachmentId,
): AttachmentFilePaths => ({
  content: join(directory, `${attachmentId}${CONTENT_SUFFIX}`),
  meta: join(directory, `${attachmentId}${META_SUFFIX}`),
});

export const attachmentIdOfFile = (filename: string): AttachmentId | null => {
  const suffix = [CONTENT_SUFFIX, META_SUFFIX].find((candidate) => filename.endsWith(candidate));
  if (suffix === undefined) {
    return null;
  }
  const parsed = AttachmentIdSchema.safeParse(filename.slice(0, -suffix.length));
  return parsed.success ? parsed.data : null;
};

export const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';
