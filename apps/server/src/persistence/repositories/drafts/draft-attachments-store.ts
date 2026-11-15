import { ConflictError } from '@relay/engine';
import type { AttachmentId, DraftId, UserId } from '@relay/shared/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { attachments, draftAttachments } from '../../schema';
import { isUniqueViolation } from '../../support/postgres-errors';

export const replaceDraftAttachments = async (
  db: DbExecutor,
  userId: UserId,
  draftId: DraftId,
  attachmentIds: readonly AttachmentId[],
): Promise<void> => {
  await db.delete(draftAttachments).where(eq(draftAttachments.draftId, draftId));
  if (attachmentIds.length === 0) {
    return;
  }
  const owned = await db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.userId, userId), inArray(attachments.id, [...attachmentIds])));
  const ownedIds = new Set(owned.map((row) => row.id));
  const values = [...new Set(attachmentIds)]
    .filter((id) => ownedIds.has(id))
    .map((attachmentId, position) => ({ draftId, attachmentId, userId, position }));
  if (values.length === 0) {
    return;
  }
  try {
    await db.insert(draftAttachments).values(values);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError('An attachment is already used by another draft', { cause: error });
    }
    throw error;
  }
};
