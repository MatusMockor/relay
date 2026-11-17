import type { AccountId, MailboxId } from '@relay/shared/domain';

export interface InitialSyncWindow {
  readonly floorUid: number;
  readonly cutoff: string;
}

export interface MailboxSyncState {
  readonly accountId: AccountId;
  readonly mailboxId: MailboxId;
  readonly uidValidity: number;
  readonly lastUid: number;
  readonly highestModseq: string | null;
  readonly initialWindow: InitialSyncWindow | null;
  readonly syncedAt: string;
}
