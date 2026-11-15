import type { MessageFlags } from '@relay/shared/domain';

export const sameMembers = <Item>(a: readonly Item[], b: readonly Item[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item));

export const flagsDiffer = (a: MessageFlags, b: MessageFlags): boolean =>
  a.seen !== b.seen || a.flagged !== b.flagged || a.answered !== b.answered;
