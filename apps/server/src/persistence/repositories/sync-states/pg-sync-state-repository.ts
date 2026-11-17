import { type MailboxSyncState, NotFoundError, type SyncStateRepository } from '@relay/engine';
import type { AccountId, MailboxId, UserId } from '@relay/shared/domain';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { mailboxes, syncState } from '../../schema';
import { toSyncState, toSyncStateInsert } from './sync-state.mapper';

export class PgSyncStateRepository implements SyncStateRepository {
  constructor(private readonly db: DbExecutor) {}

  async find(mailboxId: MailboxId): Promise<MailboxSyncState | null> {
    const [row] = await this.db.select().from(syncState).where(eq(syncState.mailboxId, mailboxId));
    return row === undefined ? null : toSyncState(row);
  }

  async listByAccount(accountId: AccountId): Promise<MailboxSyncState[]> {
    const rows = await this.db.select().from(syncState).where(eq(syncState.accountId, accountId));
    return rows.map(toSyncState);
  }

  async save(state: MailboxSyncState): Promise<void> {
    const userId = await this.mailboxOwner(state);
    const values = toSyncStateInsert(userId, state);
    await this.db
      .insert(syncState)
      .values(values)
      .onConflictDoUpdate({
        target: syncState.mailboxId,
        set: {
          uidValidity: values.uidValidity,
          lastUid: values.lastUid,
          highestModseq: values.highestModseq,
          initialFloorUid: values.initialFloorUid,
          initialCutoff: values.initialCutoff,
          syncedAt: values.syncedAt,
        },
        setWhere: eq(syncState.accountId, state.accountId),
      });
  }

  async delete(mailboxId: MailboxId): Promise<void> {
    await this.db.delete(syncState).where(eq(syncState.mailboxId, mailboxId));
  }

  private async mailboxOwner(state: MailboxSyncState): Promise<UserId> {
    const [row] = await this.db
      .select({ userId: mailboxes.userId })
      .from(mailboxes)
      .where(and(eq(mailboxes.id, state.mailboxId), eq(mailboxes.accountId, state.accountId)));
    if (row === undefined) {
      throw new NotFoundError('Mailbox', state.mailboxId);
    }
    return row.userId;
  }
}
