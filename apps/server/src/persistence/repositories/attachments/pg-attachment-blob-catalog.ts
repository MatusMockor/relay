import type {
  AttachmentBlobCatalog,
  AttachmentBlobQuery,
  StoredAttachmentBlob,
} from '@relay/engine';
import type { AttachmentId } from '@relay/shared/domain';
import { and, asc, eq, gt, inArray, lt, notExists, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { attachments, draftAttachments } from '../../schema';

const unreferenced = (db: DbExecutor): SQL =>
  notExists(
    db
      .select({ id: draftAttachments.attachmentId })
      .from(draftAttachments)
      .where(eq(draftAttachments.attachmentId, attachments.id)),
  );

export class PgAttachmentBlobCatalog implements AttachmentBlobCatalog {
  constructor(private readonly db: DbExecutor) {}

  async listCreatedBefore(query: AttachmentBlobQuery): Promise<StoredAttachmentBlob[]> {
    const rows = await this.db
      .select({ id: attachments.id, createdAt: attachments.createdAt })
      .from(attachments)
      .where(
        and(
          lt(attachments.createdAt, new Date(query.createdBefore)),
          query.after === null ? undefined : gt(attachments.id, query.after),
        ),
      )
      .orderBy(asc(attachments.id))
      .limit(query.limit);
    return rows.map((row) => ({ id: row.id, createdAt: row.createdAt.toISOString() }));
  }

  deleteUnreferenced(ids: readonly AttachmentId[]): Promise<AttachmentId[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.db.transaction(async (tx) => {
      const locked = await tx
        .select({ id: attachments.id })
        .from(attachments)
        .where(and(inArray(attachments.id, [...ids]), unreferenced(tx)))
        .for('update', { skipLocked: true });
      if (locked.length === 0) {
        return [];
      }
      const deleted = await tx
        .delete(attachments)
        .where(
          and(
            inArray(
              attachments.id,
              locked.map((row) => row.id),
            ),
            unreferenced(tx),
          ),
        )
        .returning({ id: attachments.id });
      return deleted.map((row) => row.id);
    });
  }
}
