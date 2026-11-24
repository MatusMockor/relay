import {
  MESSAGE_PENDING_KINDS,
  type MergeMapping,
  type PendingWork,
  type PendingWorkKey,
  remapPendingWork,
} from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import { and, eq, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../../database/database';
import { pendingWork } from '../../../schema';
import { toDate } from '../../../support/timestamps';
import { toPendingWork } from '../../pending-work/pg-pending-work-repository';

const keyOf = (work: PendingWorkKey): string => JSON.stringify([work.kind, work.ref]);

const memberRows = async (
  db: DbExecutor,
  accountId: AccountId,
  memberIds: readonly string[],
): Promise<PendingWork[]> => {
  const members = sql.param([...memberIds]);
  const rows = await db
    .select()
    .from(pendingWork)
    .where(
      and(
        eq(pendingWork.accountId, accountId),
        sql`${pendingWork.kind} = any(${sql.param([...MESSAGE_PENDING_KINDS])}::text[])`,
        sql`(${pendingWork.payload}->>'messageId' = any(${members}::text[])
          or (${pendingWork.kind} = 'jira-event' and ${pendingWork.ref} = any(${members}::text[])))`,
      ),
    );
  return rows.map((row) => toPendingWork(row));
};

const removeKeys = async (
  db: DbExecutor,
  accountId: AccountId,
  keys: readonly PendingWorkKey[],
): Promise<void> => {
  if (keys.length === 0) {
    return;
  }
  await db.execute(sql`delete from pending_work work
    using unnest(
      ${sql.param(keys.map((key) => key.kind))}::text[],
      ${sql.param(keys.map((key) => key.ref))}::text[]
    ) as removed(kind, ref)
    where work.account_id = ${accountId} and work.kind = removed.kind and work.ref = removed.ref`);
};

const insertWorks = async (db: DbExecutor, works: readonly PendingWork[]): Promise<void> => {
  if (works.length === 0) {
    return;
  }
  await db
    .insert(pendingWork)
    .values(works.map((work) => ({ ...work, createdAt: toDate(work.createdAt) })));
};

const isProviderOp = (work: PendingWork): work is PendingWork<'provider-op'> =>
  work.kind === 'provider-op';

export const remapMergedPendingWork = async (
  db: DbExecutor,
  accountId: AccountId,
  mapping: MergeMapping,
): Promise<PendingWork<'provider-op'>[]> => {
  const rows = await memberRows(db, accountId, [...mapping.keeperOf.keys()]);
  const { remove, write } = remapPendingWork(rows, mapping);
  await removeKeys(db, accountId, remove);
  await insertWorks(db, write);
  const removed = new Set(remove.map(keyOf));
  return [...rows.filter((row) => !removed.has(keyOf(row))), ...write].filter(isProviderOp);
};
