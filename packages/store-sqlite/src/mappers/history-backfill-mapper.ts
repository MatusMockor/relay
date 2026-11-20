import type { HistoryCursor } from '@relay/engine';
import { AccountIdSchema, MailboxIdSchema } from '@relay/shared/domain';
import type { HistoryBackfillInsert, HistoryBackfillRow } from '../schema';

export const toHistoryCursor = (row: HistoryBackfillRow): HistoryCursor => ({
  mailboxId: MailboxIdSchema.parse(row.mailboxId),
  accountId: AccountIdSchema.parse(row.accountId),
  uidValidity: row.uidValidity,
  belowUid: row.belowUid,
  doneAt: row.doneAt,
  updatedAt: row.updatedAt,
});

export const toHistoryBackfillRow = (
  cursor: HistoryCursor,
): Required<Omit<HistoryBackfillInsert, 'flagScanOffset'>> => ({
  mailboxId: cursor.mailboxId,
  accountId: cursor.accountId,
  uidValidity: cursor.uidValidity,
  belowUid: cursor.belowUid,
  doneAt: cursor.doneAt,
  updatedAt: cursor.updatedAt,
});
