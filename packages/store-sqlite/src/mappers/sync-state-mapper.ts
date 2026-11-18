import type { MailboxSyncState } from '@relay/engine';
import { AccountIdSchema, MailboxIdSchema } from '@relay/shared/domain';
import type { SyncStateRow } from '../schema';

export const toMailboxSyncState = (row: SyncStateRow): MailboxSyncState => ({
  accountId: AccountIdSchema.parse(row.accountId),
  mailboxId: MailboxIdSchema.parse(row.mailboxId),
  uidValidity: row.uidValidity,
  lastUid: row.lastUid,
  highestModseq: row.highestModseq,
  uidNext: row.uidNext,
  messageCount: row.messageCount,
  initialWindow:
    row.initialFloorUid === null || row.initialCutoff === null
      ? null
      : { floorUid: row.initialFloorUid, cutoff: row.initialCutoff },
  syncedAt: row.syncedAt,
});
