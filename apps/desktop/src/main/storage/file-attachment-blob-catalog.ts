import { readdir, rm, stat } from 'node:fs/promises';
import type {
  AttachmentBlobCatalog,
  AttachmentBlobQuery,
  AttachmentReferenceRepository,
  StoredAttachmentBlob,
} from '@relay/engine';
import type { AttachmentId } from '@relay/shared/domain';
import { attachmentFilePaths, attachmentIdOfFile, isMissingFile } from './attachment-files';

const ignoreMissing =
  <Value>(fallback: Value) =>
  (error: unknown): Value => {
    if (isMissingFile(error)) {
      return fallback;
    }
    throw error;
  };

const removeFile = (path: string): Promise<boolean> =>
  rm(path).then(() => true, ignoreMissing(false));

const modifiedAt = (path: string): Promise<number | null> =>
  stat(path).then((stats) => stats.mtimeMs, ignoreMissing(null));

export class FileAttachmentBlobCatalog implements AttachmentBlobCatalog {
  constructor(
    private readonly directory: string,
    private readonly references: AttachmentReferenceRepository,
  ) {}

  async listCreatedBefore(query: AttachmentBlobQuery): Promise<StoredAttachmentBlob[]> {
    const cutoff = Date.parse(query.createdBefore);
    const ids = (await this.storedIds()).filter((id) => query.after === null || id > query.after);
    const blobs: StoredAttachmentBlob[] = [];
    for (const id of ids) {
      if (blobs.length >= query.limit) {
        return blobs;
      }
      const createdAt = await this.createdAt(id);
      if (createdAt !== null && createdAt < cutoff) {
        blobs.push({ id, createdAt: new Date(createdAt).toISOString() });
      }
    }
    return blobs;
  }

  async deleteUnreferenced(ids: readonly AttachmentId[]): Promise<AttachmentId[]> {
    const referenced = new Set(await this.references.findReferenced(ids));
    const deleted: AttachmentId[] = [];
    for (const id of new Set(ids)) {
      if (!referenced.has(id) && (await this.remove(id))) {
        deleted.push(id);
      }
    }
    return deleted;
  }

  private async storedIds(): Promise<AttachmentId[]> {
    const names = await readdir(this.directory).catch(ignoreMissing<string[]>([]));
    const ids = names.map(attachmentIdOfFile).filter((id): id is AttachmentId => id !== null);
    return [...new Set(ids)].sort();
  }

  private async createdAt(id: AttachmentId): Promise<number | null> {
    const paths = attachmentFilePaths(this.directory, id);
    const times = await Promise.all([modifiedAt(paths.content), modifiedAt(paths.meta)]);
    const known = times.filter((time): time is number => time !== null);
    return known.length === 0 ? null : Math.max(...known);
  }

  private async remove(id: AttachmentId): Promise<boolean> {
    const paths = attachmentFilePaths(this.directory, id);
    const removed = await Promise.all([removeFile(paths.content), removeFile(paths.meta)]);
    return removed.some(Boolean);
  }
}
