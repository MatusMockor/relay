import type { AttachmentId, DraftAttachment, DraftId, UserId } from '@relay/shared/domain';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { attachments, draftAttachments } from '../../schema';

export const loadDraftAttachments = async (
  db: DbExecutor,
  draftIds: readonly DraftId[],
): Promise<Map<DraftId, DraftAttachment[]>> => {
  const grouped = new Map<DraftId, DraftAttachment[]>();
  if (draftIds.length === 0) {
    return grouped;
  }
  const rows = await db
    .select({
      draftId: draftAttachments.draftId,
      id: attachments.id,
      filename: attachments.filename,
      contentType: attachments.contentType,
      size: attachments.size,
    })
    .from(draftAttachments)
    .innerJoin(attachments, eq(attachments.id, draftAttachments.attachmentId))
    .where(inArray(draftAttachments.draftId, [...draftIds]))
    .orderBy(asc(draftAttachments.position));
  for (const { draftId, ...attachment } of rows) {
    grouped.set(draftId, [...(grouped.get(draftId) ?? []), attachment]);
  }
  return grouped;
};

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
  const values = attachmentIds
    .filter((id) => ownedIds.has(id))
    .map((attachmentId, position) => ({ draftId, attachmentId, userId, position }));
  if (values.length === 0) {
    return;
  }
  await db.insert(draftAttachments).values(values).onConflictDoNothing();
};
