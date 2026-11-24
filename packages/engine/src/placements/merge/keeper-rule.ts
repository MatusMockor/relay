import type { MergeGates, MergeMember, MergeMembers } from '../../model/message-merge';

type MemberOrder = (left: MergeMember, right: MergeMember) => number;

const firstBy = (members: MergeMembers, order: MemberOrder): MergeMember => {
  const [first, ...rest] = members;
  return rest.reduce((best, member) => (order(member, best) < 0 ? member : best), first);
};

export const compareKeepers: MemberOrder = (left, right) =>
  Number(right.inInbox) - Number(left.inInbox) || left.order - right.order;

export const keeperOf = (members: MergeMembers): MergeMember => firstBy(members, compareKeepers);

const bodyRank = (member: MergeMember): number => (member.bodyState === 'local' ? 1 : 0);

export const donorOf = (members: MergeMembers, keeper: MergeMember): MergeMember => {
  const keeperRank = (member: MergeMember): number => (member.id === keeper.id ? 1 : 0);
  return firstBy(
    members,
    (left, right) =>
      bodyRank(right) - bodyRank(left) ||
      right.bodyLength - left.bodyLength ||
      keeperRank(right) - keeperRank(left) ||
      left.order - right.order,
  );
};

const earliest = (values: readonly (string | null)[]): string | null =>
  values.reduce<string | null>((best, value) => {
    if (value === null) {
      return best;
    }
    return best === null || Date.parse(value) < Date.parse(best) ? value : best;
  }, null);

export const mergedGates = (members: readonly MergeMember[]): MergeGates => ({
  jiraEffectsAt: earliest(members.map((member) => member.gates.jiraEffectsAt)),
  inviteEffectsAt: earliest(members.map((member) => member.gates.inviteEffectsAt)),
});
