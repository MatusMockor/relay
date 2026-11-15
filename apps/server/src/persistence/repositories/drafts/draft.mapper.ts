import type { Draft, DraftAttachment, DraftContent, UserId } from '@relay/shared/domain';
import type { drafts } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

type DraftRow = typeof drafts.$inferSelect;
type DraftInsert = typeof drafts.$inferInsert;

export const toDraft = (row: DraftRow, attachments: DraftAttachment[]): Draft => ({
  id: row.id,
  accountId: row.accountId,
  to: row.to,
  cc: row.cc,
  bcc: row.bcc,
  subject: row.subject,
  body: row.body,
  inReplyToThreadId: row.inReplyToThreadId,
  inReplyToMessageId: row.inReplyToMessageId,
  attachments,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

export const toDraftInsert = (userId: UserId, draft: Draft): DraftInsert => ({
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
  createdAt: toDate(draft.createdAt),
  updatedAt: toDate(draft.updatedAt),
});

type DraftContentColumns = Omit<DraftContent, 'attachments'>;

const CONTENT_COLUMNS: readonly (keyof DraftContentColumns)[] = [
  'accountId',
  'to',
  'cc',
  'bcc',
  'subject',
  'body',
  'inReplyToThreadId',
  'inReplyToMessageId',
];

export const toDraftUpdate = (changes: Partial<DraftContent>): Partial<DraftInsert> =>
  Object.fromEntries(
    CONTENT_COLUMNS.filter((column) => changes[column] !== undefined).map((column) => [
      column,
      changes[column],
    ]),
  );
