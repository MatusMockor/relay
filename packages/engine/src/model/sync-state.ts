import type { AccountId, MailboxId } from '@relay/shared/domain';

export interface MailboxSyncState {
  readonly accountId: AccountId;
  readonly mailboxId: MailboxId;
  readonly uidValidity: number;
  readonly lastUid: number;
  readonly highestModseq: string | null;
  readonly syncedAt: string;
}
