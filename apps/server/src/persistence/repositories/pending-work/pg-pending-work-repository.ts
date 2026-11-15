import type {
  PendingWork,
  PendingWorkInput,
  PendingWorkKey,
  PendingWorkKind,
  PendingWorkPayloads,
  PendingWorkRepository,
} from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../database/database';
import { pendingWork } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

type PendingWorkRow = typeof pendingWork.$inferSelect;

const toPendingWork = <Kind extends PendingWorkKind>(row: PendingWorkRow): PendingWork<Kind> => ({
  accountId: row.accountId,
  kind: row.kind as Kind,
  ref: row.ref,
  payload: row.payload as PendingWorkPayloads[Kind],
  revision: row.revision,
  createdAt: toIso(row.createdAt),
});

const NEW_REVISION = sql`gen_random_uuid()::text`;

const keyed = (key: PendingWorkKey) =>
  and(
    eq(pendingWork.accountId, key.accountId),
    eq(pendingWork.kind, key.kind),
    eq(pendingWork.ref, key.ref),
  );

export class PgPendingWorkRepository implements PendingWorkRepository {
  constructor(private readonly db: DbExecutor) {}

  async put<Kind extends PendingWorkKind>(
    work: PendingWorkInput<Kind>,
  ): Promise<PendingWork<Kind>> {
    const createdAt = toDate(work.createdAt);
    const [row] = await this.db
      .insert(pendingWork)
      .values({ ...work, createdAt, revision: NEW_REVISION })
      .onConflictDoUpdate({
        target: [pendingWork.accountId, pendingWork.kind, pendingWork.ref],
        set: { payload: work.payload, createdAt, revision: NEW_REVISION },
      })
      .returning();
    return row === undefined ? { ...work, revision: '' } : toPendingWork<Kind>(row);
  }

  async find<Kind extends PendingWorkKind>(
    key: PendingWorkKey<Kind>,
  ): Promise<PendingWork<Kind> | null> {
    const [row] = await this.db.select().from(pendingWork).where(keyed(key));
    return row === undefined ? null : toPendingWork<Kind>(row);
  }

  async list<Kind extends PendingWorkKind>(
    accountId: AccountId,
    kind: Kind,
  ): Promise<PendingWork<Kind>[]> {
    const rows = await this.db
      .select()
      .from(pendingWork)
      .where(and(eq(pendingWork.accountId, accountId), eq(pendingWork.kind, kind)))
      .orderBy(asc(pendingWork.createdAt), asc(pendingWork.ref));
    return rows.map((row) => toPendingWork<Kind>(row));
  }

  async listByKind<Kind extends PendingWorkKind>(kind: Kind): Promise<PendingWork<Kind>[]> {
    const rows = await this.db
      .select()
      .from(pendingWork)
      .where(eq(pendingWork.kind, kind))
      .orderBy(asc(pendingWork.createdAt), asc(pendingWork.ref));
    return rows.map((row) => toPendingWork<Kind>(row));
  }

  async remove(works: readonly PendingWork[]): Promise<void> {
    for (const work of works) {
      await this.db
        .delete(pendingWork)
        .where(and(keyed(work), eq(pendingWork.revision, work.revision)));
    }
  }
}
