import {
  type GroupMergePlan,
  type MergedGroup,
  type MergeMember,
  type MergeReport,
  type MergeSkipReason,
  planGroupMerge,
} from '@relay/engine';

export interface ChunkPlan {
  readonly plans: readonly GroupMergePlan[];
  readonly report: MergeReport;
}

const mergedOf = (emailId: string, { keeper, losers }: GroupMergePlan): MergedGroup => ({
  emailId,
  keeperId: keeper.id,
  loserIds: losers.map((loser) => loser.id),
  threadId: keeper.threadId,
});

export const planChunk = (groups: ReadonlyMap<string, readonly MergeMember[]>): ChunkPlan => {
  const plans: GroupMergePlan[] = [];
  const merged: MergedGroup[] = [];
  const skipped: Record<MergeSkipReason, number> = { 'spans-threads': 0, 'mailbox-conflict': 0 };
  groups.forEach((members, emailId) => {
    const decision = planGroupMerge(members);
    if (decision.verdict === 'merge') {
      plans.push(decision.plan);
      merged.push(mergedOf(emailId, decision.plan));
      return;
    }
    if (decision.verdict !== 'single') {
      skipped[decision.verdict] += 1;
    }
  });
  return { plans, report: { merged, skipped } };
};
