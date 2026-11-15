import type { AttachmentStore, AttachmentUpload, StoredAttachment } from '@relay/engine';
import type { AttachmentId, DraftAttachment, UserId } from '@relay/shared/domain';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { attachments } from '../../schema';

const metadataColumns = {
  id: attachments.id,
  filename: attachments.filename,
  contentType: attachments.contentType,
  size: attachments.size,
};

export class PgAttachmentStore implements AttachmentStore {
  constructor(private readonly db: DbExecutor) {}

  async put(userId: UserId, upload: AttachmentUpload): Promise<DraftAttachment> {
    const [row] = await this.db
      .insert(attachments)
      .values({
        userId,
        filename: upload.filename,
        contentType: upload.contentType,
        size: upload.content.byteLength,
        content: Buffer.from(upload.content),
      })
      .returning(metadataColumns);
    if (row === undefined) {
      throw new Error('Attachment insert returned no row');
    }
    return row;
  }

  async get(userId: UserId, attachmentId: AttachmentId): Promise<StoredAttachment | null> {
    const [row] = await this.db
      .select({ ...metadataColumns, content: attachments.content })
      .from(attachments)
      .where(and(eq(attachments.userId, userId), eq(attachments.id, attachmentId)));
    if (row === undefined) {
      return null;
    }
    const { content, ...attachment } = row;
    return { attachment, content: new Uint8Array(content) };
  }

  async delete(userId: UserId, attachmentId: AttachmentId): Promise<boolean> {
    const rows = await this.db
      .delete(attachments)
      .where(and(eq(attachments.userId, userId), eq(attachments.id, attachmentId)))
      .returning({ id: attachments.id });
    return rows.length > 0;
  }
}
