import type { GroupMergeDecision, GroupMergePlan, MergeReport } from '@relay/engine';

export interface DecidedGroup {
  readonly emailId: string;
  readonly decision: GroupMergeDecision;
}

export interface PlannedGroup {
  readonly emailId: string;
  readonly plan: GroupMergePlan;
}

export const plannedGroups = (decided: readonly DecidedGroup[]): PlannedGroup[] =>
  decided.flatMap(({ emailId, decision }) =>
    decision.verdict === 'merge' ? [{ emailId, plan: decision.plan }] : [],
  );

const countOf = (decided: readonly DecidedGroup[], verdict: string): number =>
  decided.filter(({ decision }) => decision.verdict === verdict).length;

export const EMPTY_MERGE_REPORT: MergeReport = {
  merged: [],
  skipped: { 'spans-threads': 0, 'mailbox-conflict': 0 },
};

export const mergeReportOf = (decided: readonly DecidedGroup[]): MergeReport => ({
  merged: plannedGroups(decided).map(({ emailId, plan }) => ({
    emailId,
    keeperId: plan.keeper.id,
    loserIds: plan.losers.map((loser) => loser.id),
    threadId: plan.keeper.threadId,
  })),
  skipped: {
    'spans-threads': countOf(decided, 'spans-threads'),
    'mailbox-conflict': countOf(decided, 'mailbox-conflict'),
  },
});
