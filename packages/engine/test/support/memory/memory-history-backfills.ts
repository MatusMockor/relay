import type { AccountId, MailboxId } from '@relay/shared/domain';
import type { HistoryBackfillRepository, HistoryCursor, HistoryMailboxCount } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export class MemoryHistoryBackfills implements HistoryBackfillRepository {
  readonly saved: HistoryCursor[] = [];

  constructor(private readonly db: MemoryDatabase) {}

  find(mailboxId: MailboxId): Promise<HistoryCursor | null> {
    return Promise.resolve(this.db.tables.historyCursors.get(mailboxId) ?? null);
  }

  save(cursor: HistoryCursor): Promise<void> {
    this.saved.push(cursor);
    this.db.tables.historyCursors.set(cursor.mailboxId, cursor);
    return Promise.resolve();
  }

  storedUids(mailboxId: MailboxId, uids: readonly number[]): Promise<number[]> {
    const wanted = new Set(uids);
    const stored = [...this.db.tables.messages.values()]
      .filter((message) => message.mailboxId === mailboxId && wanted.has(message.uid))
      .map((message) => message.uid);
    return Promise.resolve(stored.sort((left, right) => left - right));
  }

  countsByMailbox(accountId: AccountId): Promise<HistoryMailboxCount[]> {
    const counts = new Map<MailboxId, number>();
    [...this.db.tables.messages.values()]
      .filter((message) => message.accountId === accountId)
      .forEach((message) => {
        counts.set(message.mailboxId, (counts.get(message.mailboxId) ?? 0) + 1);
      });
    return Promise.resolve([...counts].map(([mailboxId, stored]) => ({ mailboxId, stored })));
  }

  countDistinct(accountId: AccountId, mailboxIds: readonly MailboxId[]): Promise<number> {
    const wanted = new Set(mailboxIds);
    const keys = [...this.db.tables.messages.values()]
      .filter((message) => message.accountId === accountId && wanted.has(message.mailboxId))
      .map((message) => message.messageIdHeader ?? message.emailId ?? message.id);
    return Promise.resolve(new Set(keys).size);
  }

  flagScanOffset(mailboxId: MailboxId): Promise<number | null> {
    return Promise.resolve(this.db.tables.historyFlagOffsets.get(mailboxId) ?? null);
  }

  saveFlagScanOffset(mailboxId: MailboxId, offset: number): Promise<void> {
    if (this.db.tables.historyCursors.has(mailboxId)) {
      this.db.tables.historyFlagOffsets.set(mailboxId, offset);
    }
    return Promise.resolve();
  }
}
