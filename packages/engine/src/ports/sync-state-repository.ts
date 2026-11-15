import type { AccountId, MailboxId } from '@relay/shared/domain';
import type { MailboxSyncState } from '../model/sync-state';

export interface SyncStateRepository {
  find(mailboxId: MailboxId): Promise<MailboxSyncState | null>;
  listByAccount(accountId: AccountId): Promise<MailboxSyncState[]>;
  save(state: MailboxSyncState): Promise<void>;
  delete(mailboxId: MailboxId): Promise<void>;
}
