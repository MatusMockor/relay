import type { HistoryBackfillRepository, HistoryCursor, HistoryMailboxCount } from '@relay/engine';
import { type AccountId, type MailboxId, MailboxIdSchema } from '@relay/shared/domain';
import { and, asc, count, countDistinct, eq, inArray, sql } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toHistoryBackfillRow, toHistoryCursor } from '../mappers/history-backfill-mapper';
import { historyBackfill, mailboxes, messagePlacements, messages } from '../schema';
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
            .select({ uid: messagePlacements.uid })
            .from(messagePlacements)
            .where(
              and(
                eq(messagePlacements.mailboxId, mailboxId),
                inArray(messagePlacements.uid, chunk),
              ),
            )
            .orderBy(asc(messagePlacements.uid))
            .all()
            .map((row) => row.uid),
        )
        .sort((left, right) => left - right),
    );
  }

  countsByMailbox(accountId: AccountId): Promise<HistoryMailboxCount[]> {
    return this.executor.execute((db) =>
      db
        .select({ mailboxId: messagePlacements.mailboxId, stored: count() })
        .from(messagePlacements)
        .innerJoin(mailboxes, eq(mailboxes.id, messagePlacements.mailboxId))
        .where(eq(mailboxes.accountId, accountId))
        .groupBy(messagePlacements.mailboxId)
        .orderBy(asc(messagePlacements.mailboxId))
        .all()
        .map((row) => ({ mailboxId: MailboxIdSchema.parse(row.mailboxId), stored: row.stored })),
    );
  }

  countDistinct(accountId: AccountId, mailboxIds: readonly MailboxId[]): Promise<number> {
    if (mailboxIds.length === 0) {
      return Promise.resolve(0);
    }
    return this.executor.execute(
      (db) =>
        db
          .select({
            stored: countDistinct(
              sql`coalesce(${messages.emailId}, ${messagePlacements.messageId})`,
            ),
          })
          .from(messagePlacements)
          .innerJoin(messages, eq(messages.id, messagePlacements.messageId))
          .where(
            and(
              eq(messages.accountId, accountId),
              inArray(messagePlacements.mailboxId, [...mailboxIds]),
            ),
          )
          .get()?.stored ?? 0,
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
