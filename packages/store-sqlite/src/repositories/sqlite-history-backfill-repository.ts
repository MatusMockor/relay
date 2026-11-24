import type { HistoryBackfillRepository, HistoryCursor, HistoryMailboxCount } from '@relay/engine';
import { type AccountId, type MailboxId, MailboxIdSchema } from '@relay/shared/domain';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toHistoryBackfillRow, toHistoryCursor } from '../mappers/history-backfill-mapper';
import { historyBackfill, messages } from '../schema';
import { chunked } from './chunked';

export class SqliteHistoryBackfillRepository implements HistoryBackfillRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  find(mailboxId: MailboxId): Promise<HistoryCursor | null> {
    return this.executor.execute((db) => {
      const row = db
        .select()
        .from(historyBackfill)
        .where(eq(historyBackfill.mailboxId, mailboxId))
        .get();
      return row === undefined ? null : toHistoryCursor(row);
    });
  }

  save(cursor: HistoryCursor): Promise<void> {
    return this.executor.execute((db) => {
      const row = toHistoryBackfillRow(cursor);
      const { mailboxId: _mailboxId, ...changes } = row;
      db.insert(historyBackfill)
        .values(row)
        .onConflictDoUpdate({ target: historyBackfill.mailboxId, set: changes })
        .run();
    });
  }

  storedUids(mailboxId: MailboxId, uids: readonly number[]): Promise<number[]> {
    return this.executor.execute((db) =>
      chunked([...new Set(uids)])
        .flatMap((chunk) =>
          db
            .select({ uid: messages.uid })
            .from(messages)
            .where(and(eq(messages.mailboxId, mailboxId), inArray(messages.uid, chunk)))
            .orderBy(asc(messages.uid))
            .all()
            .map((row) => row.uid),
        )
        .sort((left, right) => left - right),
    );
  }

  countsByMailbox(accountId: AccountId): Promise<HistoryMailboxCount[]> {
    return this.executor.execute((db) =>
      db
        .select({ mailboxId: messages.mailboxId, stored: count() })
        .from(messages)
        .where(eq(messages.accountId, accountId))
        .groupBy(messages.mailboxId)
        .orderBy(asc(messages.mailboxId))
        .all()
        .map((row) => ({ mailboxId: MailboxIdSchema.parse(row.mailboxId), stored: row.stored })),
    );
  }

  flagScanOffset(mailboxId: MailboxId): Promise<number | null> {
    return this.executor.execute((db) => {
      const row = db
        .select({ offset: historyBackfill.flagScanOffset })
        .from(historyBackfill)
        .where(eq(historyBackfill.mailboxId, mailboxId))
        .get();
      return row?.offset ?? null;
    });
  }

  saveFlagScanOffset(mailboxId: MailboxId, offset: number): Promise<void> {
    return this.executor.execute((db) => {
      db.update(historyBackfill)
        .set({ flagScanOffset: offset })
        .where(eq(historyBackfill.mailboxId, mailboxId))
        .run();
    });
  }
}
