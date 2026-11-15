import { type Draft, type DraftAttachment, DraftSchema, type UserId } from '@relay/shared/domain';
import type { DraftAttachmentRow, DraftRow, draftAttachments, drafts } from '../schema';
import { toTimestamp } from './timestamp';

export const toDraft = (row: DraftRow, attachments: readonly DraftAttachmentRow[]): Draft =>
  DraftSchema.parse({
    id: row.id,
    accountId: row.accountId,
    to: row.to,
    cc: row.cc,
    bcc: row.bcc,
    subject: row.subject,
    body: row.body,
    inReplyToThreadId: row.inReplyToThreadId,
    inReplyToMessageId: row.inReplyToMessageId,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export const toDraftRow = (userId: UserId, draft: Draft): typeof drafts.$inferInsert => ({
  id: draft.id,
  userId,
  accountId: draft.accountId,
  to: draft.to,
  cc: draft.cc,
  bcc: draft.bcc,
  subject: draft.subject,
  body: draft.body,
  inReplyToThreadId: draft.inReplyToThreadId,
  inReplyToMessageId: draft.inReplyToMessageId,
  createdAt: draft.createdAt,
  updatedAt: draft.updatedAt,
  updatedTs: toTimestamp(draft.updatedAt),
});

export const toDraftAttachmentRows = (
  draftId: string,
  attachments: readonly DraftAttachment[],
): (typeof draftAttachments.$inferInsert)[] =>
  attachments.map((attachment, position) => ({
    id: attachment.id,
    draftId,
    filename: attachment.filename,
    contentType: attachment.contentType,
    size: attachment.size,
    position,
  }));
