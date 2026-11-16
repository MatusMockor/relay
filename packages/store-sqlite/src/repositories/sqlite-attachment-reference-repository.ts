import type { AttachmentReferenceRepository } from '@relay/engine';
import { type AttachmentId, AttachmentIdSchema } from '@relay/shared/domain';
import { inArray } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { draftAttachments } from '../schema';
import { chunked } from './chunked';

export class SqliteAttachmentReferenceRepository implements AttachmentReferenceRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  findReferenced(ids: readonly AttachmentId[]): Promise<AttachmentId[]> {
    return this.executor.execute((db) =>
      chunked([...new Set(ids)]).flatMap((chunk) =>
        db
          .select({ id: draftAttachments.id })
          .from(draftAttachments)
          .where(inArray(draftAttachments.id, chunk))
          .all()
          .map((row) => AttachmentIdSchema.parse(row.id)),
      ),
    );
  }
}
