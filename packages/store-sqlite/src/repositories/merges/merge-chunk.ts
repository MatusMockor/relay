import { type MergeGroup, type MergeReport, mergeMappingOf, messageIdRemapOf } from '@relay/engine';
import type { RelayDb } from '../../database/sqlite-database';
import { planChunk } from './merge-chunk-plan';
import { readMergeMembers } from './merge-members';
import { MERGE_STEPS, type MergeContext, type MergeStepObserver } from './merge-steps';
import { fillMergeTables, resetMergeTables } from './merge-temp-tables';

const timed = (name: string, observe: MergeStepObserver, run: () => void): void => {
  const started = performance.now();
  run();
  observe(name, performance.now() - started);
};

export const mergeChunk = (
  db: RelayDb,
  accountId: string,
  groups: readonly MergeGroup[],
  observe: MergeStepObserver,
): MergeReport => {
  const started = performance.now();
  const members = readMergeMembers(
    db,
    accountId,
    groups.map((group) => group.emailId),
  );
  const { plans, report } = planChunk(members);
  observe('plan', performance.now() - started);
  if (plans.length === 0) {
    return report;
  }
  const mapping = mergeMappingOf(plans);
  const context: MergeContext = {
    db,
    accountId,
    mapping,
    remap: messageIdRemapOf(mapping.keeperOf),
    keeperIds: report.merged.map((group) => group.keeperId),
  };
  timed('stage', observe, () => {
    resetMergeTables(db);
    fillMergeTables(db, plans);
  });
  MERGE_STEPS.forEach((step) => {
    timed(step.name, observe, () => {
      step.run(context);
    });
  });
  resetMergeTables(db);
  return report;
};
