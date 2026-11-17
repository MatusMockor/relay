import type { MailboxSyncState, SyncStateRepository } from '@relay/engine';
import type { AccountId, MailboxId } from '@relay/shared/domain';
import { asc, eq } from 'drizzle-orm';
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toMailboxSyncState } from '../mappers/sync-state-mapper';
import { syncState } from '../schema';

export class SqliteSyncStateRepository implements SyncStateRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  find(mailboxId: MailboxId): Promise<MailboxSyncState | null> {
    return this.executor.execute((db) => {
      const row = db.select().from(syncState).where(eq(syncState.mailboxId, mailboxId)).get();
      return row === undefined ? null : toMailboxSyncState(row);
    });
  }

  listByAccount(accountId: AccountId): Promise<MailboxSyncState[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(syncState)
        .where(eq(syncState.accountId, accountId))
        .orderBy(asc(syncState.mailboxId))
        .all()
        .map(toMailboxSyncState),
    );
  }

  save(state: MailboxSyncState): Promise<void> {
    return this.executor.execute((db) => {
      const values = {
        accountId: state.accountId,
        uidValidity: state.uidValidity,
        lastUid: state.lastUid,
        highestModseq: state.highestModseq,
        initialFloorUid: state.initialWindow?.floorUid ?? null,
        initialCutoff: state.initialWindow?.cutoff ?? null,
        syncedAt: state.syncedAt,
      };
      db.insert(syncState)
        .values({ mailboxId: state.mailboxId, ...values })
        .onConflictDoUpdate({ target: syncState.mailboxId, set: values })
        .run();
    });
  }

  delete(mailboxId: MailboxId): Promise<void> {
    return this.executor.execute((db) => {
      db.delete(syncState).where(eq(syncState.mailboxId, mailboxId)).run();
    });
  }
}
