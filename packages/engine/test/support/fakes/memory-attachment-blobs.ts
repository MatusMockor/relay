import type { AttachmentId } from '@relay/shared/domain';
import type {
  AttachmentBlobCatalog,
  AttachmentBlobQuery,
  AttachmentReferenceRepository,
  StoredAttachmentBlob,
} from '../../../src';
import type { MemoryDatabase } from '../memory/memory-database';
import type { MemoryAttachmentStore } from './infrastructure';

export class MemoryAttachmentReferences implements AttachmentReferenceRepository {
  constructor(private readonly db: MemoryDatabase) {}

  findReferenced(ids: readonly AttachmentId[]): Promise<AttachmentId[]> {
    const referenced = new Set(
      [...this.db.tables.drafts.values()].flatMap((stored) =>
        stored.draft.attachments.map((attachment) => attachment.id),
      ),
    );
    return Promise.resolve(ids.filter((id) => referenced.has(id)));
  }
}

export class MemoryAttachmentBlobCatalog implements AttachmentBlobCatalog {
  beforeDelete: (() => Promise<void>) | null = null;

  constructor(
    private readonly store: MemoryAttachmentStore,
    private readonly references: AttachmentReferenceRepository,
  ) {}

  listCreatedBefore(query: AttachmentBlobQuery): Promise<StoredAttachmentBlob[]> {
    const blobs = [...this.store.entries.entries()]
      .map(([id, entry]) => ({ id, createdAt: entry.createdAt }))
      .filter((blob) => Date.parse(blob.createdAt) < Date.parse(query.createdBefore))
      .filter((blob) => query.after === null || blob.id > query.after)
      .sort((left, right) => (left.id < right.id ? -1 : 1));
    return Promise.resolve(blobs.slice(0, query.limit));
  }

  async deleteUnreferenced(ids: readonly AttachmentId[]): Promise<AttachmentId[]> {
    await this.beforeDelete?.();
    const referenced = new Set(await this.references.findReferenced(ids));
    const removed = await Promise.all(
      ids
        .filter((id) => !referenced.has(id))
        .map(async (id) => ((await this.store.removeBlob(id)) ? [id] : [])),
    );
    return removed.flat();
  }
}
