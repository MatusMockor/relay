import type { MailboxSyncState } from '@relay/engine';
import type { UserId } from '@relay/shared/domain';
import type { syncState } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

type SyncStateRow = typeof syncState.$inferSelect;
type SyncStateInsert = typeof syncState.$inferInsert;

export const toSyncState = (row: SyncStateRow): MailboxSyncState => ({
  accountId: row.accountId,
  mailboxId: row.mailboxId,
  uidValidity: row.uidValidity,
  lastUid: row.lastUid,
  highestModseq: row.highestModseq,
  initialSyncPending: row.initialSyncPending,
  syncedAt: toIso(row.syncedAt),
});

export const toSyncStateInsert = (userId: UserId, state: MailboxSyncState): SyncStateInsert => ({
  mailboxId: state.mailboxId,
  userId,
  accountId: state.accountId,
  uidValidity: state.uidValidity,
  lastUid: state.lastUid,
  highestModseq: state.highestModseq,
  initialSyncPending: state.initialSyncPending,
  syncedAt: toDate(state.syncedAt),
});
