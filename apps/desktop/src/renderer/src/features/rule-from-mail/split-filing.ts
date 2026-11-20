import {
  type AccountId,
  type Split,
  type SplitEntry,
  type SplitInput,
  type SplitRule,
  supportedSplits,
} from '@relay/shared';
import { splitInputOf } from '../../data/split-input';

export const NEW_SPLIT = 'new';

export const filingTargets = (entries: readonly SplitEntry[], accountId: AccountId): Split[] =>
  supportedSplits(entries)
    .filter((split) => split.accountId === null || split.accountId === accountId)
    .sort((left, right) => left.order - right.order);

const sameRule = (left: SplitRule, right: SplitRule): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const joinIssue = (split: Split, rules: readonly SplitRule[]): string | null => {
  if (split.match !== 'any') {
    return `Split ${split.name} zachytí mail, len keď platia všetky jeho podmienky. Uprav ho v nastaveniach alebo vytvor nový split.`;
  }
  const [rule] = rules;
  if (rule === undefined || rules.length > 1) {
    return 'Do existujúceho splitu sa dá pridať jedna podmienka. Nechaj zaškrtnutú jednu možnosť alebo vytvor nový split.';
  }
  if (split.rules.some((known) => sameRule(known, rule))) {
    return `Split ${split.name} už túto podmienku má.`;
  }
  return null;
};

export const joinedSplits = (
  entries: readonly SplitEntry[],
  target: Split,
  rules: readonly SplitRule[],
): SplitInput[] =>
  supportedSplits(entries).map((split) =>
    split.id === target.id
      ? { ...splitInputOf(split), rules: [...split.rules, ...rules] }
      : splitInputOf(split),
  );

export const withNewSplit = (
  entries: readonly SplitEntry[],
  name: string,
  accountId: AccountId,
  rules: readonly SplitRule[],
): SplitInput[] => [
  ...supportedSplits(entries).map(splitInputOf),
  {
    accountId,
    name,
    order: entries.length,
    match: rules.length > 1 ? 'all' : 'any',
    rules: [...rules],
    exceptions: [],
    exclusive: true,
    hideTasks: false,
  },
];
