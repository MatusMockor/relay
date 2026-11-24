import type { AccountId, MailboxId } from '@relay/shared/domain';
import type { HistoryCursor, HistoryMailboxCount } from '../model/history-backfill';

export interface HistoryBackfillRepository {
  find(mailboxId: MailboxId): Promise<HistoryCursor | null>;
  save(cursor: HistoryCursor): Promise<void>;
  storedUids(mailboxId: MailboxId, uids: readonly number[]): Promise<number[]>;
  countsByMailbox(accountId: AccountId): Promise<HistoryMailboxCount[]>;
  countDistinct(accountId: AccountId, mailboxIds: readonly MailboxId[]): Promise<number>;
  flagScanOffset(mailboxId: MailboxId): Promise<number | null>;
  saveFlagScanOffset(mailboxId: MailboxId, offset: number): Promise<void>;
}
