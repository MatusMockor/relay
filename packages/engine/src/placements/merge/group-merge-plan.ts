import type { MessageId, MessagePlacement } from '@relay/shared/domain';
import type {
  GroupMergeDecision,
  GroupMergePlan,
  MergeMapping,
  MergeMember,
} from '../../model/message-merge';
import { verdictOf } from './group-verdict';
import { donorOf, keeperOf, mergedGates } from './keeper-rule';
import { reducePlacements } from './placement-reduction';

export const planGroupMerge = (members: readonly MergeMember[]): GroupMergeDecision => {
  const verdict = verdictOf(members);
  const [first, ...rest] = members;
  if (verdict !== 'merge' || first === undefined) {
    return { verdict: verdict === 'merge' ? 'single' : verdict };
  }
  const all = [first, ...rest] as const;
  const keeper = keeperOf(all);
  return {
    verdict: 'merge',
    plan: {
      keeper,
      losers: members.filter((member) => member.id !== keeper.id),
      donor: donorOf(all, keeper),
      gates: mergedGates(members),
      placements: reducePlacements(members, keeper.id),
    },
  };
};

export const mergeMappingOf = (plans: readonly GroupMergePlan[]): MergeMapping => {
  const keeperOf = new Map<MessageId, MessageId>();
  const primaryOf = new Map<MessageId, MessagePlacement>();
  for (const { keeper, losers } of plans) {
    for (const member of [keeper, ...losers]) {
      keeperOf.set(member.id, keeper.id);
      primaryOf.set(member.id, member.primary);
    }
  }
  return { keeperOf, primaryOf };
};
