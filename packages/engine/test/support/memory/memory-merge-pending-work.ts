import type { AccountId, MessageId } from '@relay/shared/domain';
import {
  MESSAGE_PENDING_KINDS,
  type MergeMapping,
  type PendingOverrides,
  type PendingWork,
  pendingOverrides,
  remapPendingWork,
} from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { pendingWorkKeyOf } from './memory-pending-work-repository';

const MESSAGE_KINDS: ReadonlySet<string> = new Set(MESSAGE_PENDING_KINDS);

const isProviderOp = (work: PendingWork): work is PendingWork<'provider-op'> =>
  work.kind === 'provider-op';

const rowsOf = (db: MemoryDatabase, accountId: AccountId): PendingWork[] =>
  [...db.tables.pendingWork.values()].filter(
    (work) => work.accountId === accountId && MESSAGE_KINDS.has(work.kind),
  );

export const remapPendingWorkIn = (
  db: MemoryDatabase,
  accountId: AccountId,
  mapping: MergeMapping,
): void => {
  const { remove, write } = remapPendingWork(rowsOf(db, accountId), mapping);
  remove.forEach((key) => db.tables.pendingWork.delete(pendingWorkKeyOf(key)));
  write.forEach((work) => db.tables.pendingWork.set(pendingWorkKeyOf(work), work));
};

export const overridesOf = (
  db: MemoryDatabase,
  accountId: AccountId,
  keeperId: MessageId,
): PendingOverrides =>
  pendingOverrides(
    rowsOf(db, accountId)
      .filter(isProviderOp)
      .filter((work) => work.payload.messageId === keeperId),
  );
