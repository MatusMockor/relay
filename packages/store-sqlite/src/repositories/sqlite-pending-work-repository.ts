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
import type { SqliteExecutor } from '../executor/sqlite-executor';
import { toPendingWork } from '../mappers/pending-work-mapper';
import { pendingWork } from '../schema';

const NEW_REVISION = sql`lower(hex(randomblob(16)))`;

const keyed = (key: PendingWorkKey) =>
  and(
    eq(pendingWork.accountId, key.accountId),
    eq(pendingWork.kind, key.kind),
    eq(pendingWork.ref, key.ref),
  );

export class SqlitePendingWorkRepository implements PendingWorkRepository {
  constructor(private readonly executor: SqliteExecutor) {}

  put<Kind extends PendingWorkKind>(work: PendingWorkInput<Kind>): Promise<PendingWork<Kind>> {
    return this.executor.execute((db) => {
      const row = db
        .insert(pendingWork)
        .values({ ...work, revision: NEW_REVISION })
        .onConflictDoUpdate({
          target: [pendingWork.accountId, pendingWork.kind, pendingWork.ref],
          set: {
            payload: work.payload,
            createdAt: work.createdAt,
            revision: NEW_REVISION,
          },
        })
        .returning()
        .get();
      return toPendingWork<Kind>(row);
    });
  }

  replace<Kind extends PendingWorkKind>(
    work: PendingWork<Kind>,
    payload: PendingWorkPayloads[Kind],
  ): Promise<PendingWork<Kind> | null> {
    return this.executor.execute((db) => {
      const [row] = db
        .update(pendingWork)
        .set({ payload, revision: NEW_REVISION })
        .where(and(keyed(work), eq(pendingWork.revision, work.revision)))
        .returning()
        .all();
      return row === undefined ? null : toPendingWork<Kind>(row);
    });
  }

  find<Kind extends PendingWorkKind>(key: PendingWorkKey<Kind>): Promise<PendingWork<Kind> | null> {
    return this.executor.execute((db) => {
      const row = db.select().from(pendingWork).where(keyed(key)).get();
      return row === undefined ? null : toPendingWork<Kind>(row);
    });
  }

  list<Kind extends PendingWorkKind>(
    accountId: AccountId,
    kind: Kind,
  ): Promise<PendingWork<Kind>[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(pendingWork)
        .where(and(eq(pendingWork.accountId, accountId), eq(pendingWork.kind, kind)))
        .orderBy(asc(pendingWork.createdAt), asc(pendingWork.ref))
        .all()
        .map((row) => toPendingWork<Kind>(row)),
    );
  }

  listByKind<Kind extends PendingWorkKind>(kind: Kind): Promise<PendingWork<Kind>[]> {
    return this.executor.execute((db) =>
      db
        .select()
        .from(pendingWork)
        .where(eq(pendingWork.kind, kind))
        .orderBy(asc(pendingWork.createdAt), asc(pendingWork.ref))
        .all()
        .map((row) => toPendingWork<Kind>(row)),
    );
  }

  remove(works: readonly PendingWork[]): Promise<void> {
    return this.executor.execute((db) => {
      works.forEach((work) => {
        db.delete(pendingWork)
          .where(and(keyed(work), eq(pendingWork.revision, work.revision)))
          .run();
      });
    });
  }
}
