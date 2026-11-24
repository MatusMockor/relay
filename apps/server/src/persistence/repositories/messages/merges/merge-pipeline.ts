import { type GroupMergePlan, mergeMappingOf } from '@relay/engine';
import type { AccountId } from '@relay/shared/domain';
import type { DbExecutor } from '../../../database/database';
import { findAccountOwner } from '../../../support/account-owner';
import { remapColumnReferences } from './merge-column-remaps';
import { remapJsonReferences } from './merge-json-references';
import { takeKeeperFields } from './merge-keeper-fields';
import { applyPendingOverrides } from './merge-pending-overrides';
import { remapMergedPendingWork } from './merge-pending-work';
import { reduceMergedPlacements } from './merge-placements';
import { retireLosers } from './merge-retirement';
import { mergeIdsOf, prepareMergeTables } from './merge-tables';

export const applyMergePlans = async (
  db: DbExecutor,
  accountId: AccountId,
  plans: readonly GroupMergePlan[],
): Promise<void> => {
  const mapping = mergeMappingOf(plans);
  const userId = await findAccountOwner(db, accountId);
  const ids = mergeIdsOf(plans);
  await prepareMergeTables(db, plans);
  await reduceMergedPlacements(db, plans, ids);
  await remapColumnReferences(db, { userId, ids });
  await remapJsonReferences(db, userId, mapping);
  await applyPendingOverrides(db, accountId, await remapMergedPendingWork(db, accountId, mapping));
  await takeKeeperFields(db, ids);
  await retireLosers(db, plans, ids);
};
