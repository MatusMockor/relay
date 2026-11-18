import type { MailAccount, MailboxId, MailboxRole, Split, UserId } from '@relay/shared/domain';
import type { PendingWork } from '../../model/pending-work';
import type { MailProvider } from '../../ports/mail-provider';
import type { InboxArrival } from './sync-arrivals';
import type { SyncJournal } from './sync-journal';

export interface SyncStats {
  newMessages: number;
  updatedThreads: number;
}

export interface SyncContext {
  readonly userId: UserId;
  readonly account: MailAccount;
  readonly provider: MailProvider;
  readonly splits: readonly Split[];
  readonly mailboxRoles: Map<MailboxId, MailboxRole>;
  readonly journal: SyncJournal;
  readonly stats: SyncStats;
  readonly arrivals: InboxArrival[];
  readonly arrivalWork: PendingWork<'message-effects'>[];
}
