import {
  type AccountId,
  type AutomationCriteria,
  type SplitId,
  type SplitOverlap,
  type SplitOverlapKind,
  splitCriteria,
} from '@relay/shared';
import { demoMessageMatches } from './demo-automation-match';
import type { DemoRecentMatch } from './demo-recent-matches';
import type { DemoState } from './demo-state';

interface DemoRival {
  readonly kind: SplitOverlapKind;
  readonly id: string;
  readonly name: string;
  readonly accountId: AccountId | null;
  readonly criteria: AutomationCriteria;
}

const PLACING_ACTIONS: ReadonlySet<string> = new Set(['archive', 'moveTo']);

const rivalsOf = (state: DemoState, splitId: SplitId | null): DemoRival[] => {
  const own = state.splits.find((split) => split.id === splitId);
  const splits = state.splits
    .filter((split) => split.id !== splitId && (own === undefined || split.order < own.order))
    .sort((left, right) => left.order - right.order)
    .map((split): DemoRival => ({ kind: 'split', ...split, criteria: splitCriteria(split) }));
  const automations = state.automations
    .filter(
      (automation) =>
        automation.enabled && automation.actions.some((action) => PLACING_ACTIONS.has(action.type)),
    )
    .sort((left, right) => left.order - right.order)
    .map((automation): DemoRival => ({ kind: 'automation', ...automation, criteria: automation }));
  return [...splits, ...automations];
};

const catches = (rival: DemoRival, match: DemoRecentMatch): boolean =>
  (rival.accountId === null || rival.accountId === match.record.summary.accountId) &&
  match.recent.some((message) =>
    demoMessageMatches(rival.criteria, message, match.record.summary.jiraKey),
  );

export const demoSplitOverlaps = (
  state: DemoState,
  splitId: SplitId | null,
  matches: readonly DemoRecentMatch[],
): SplitOverlap[] =>
  rivalsOf(state, splitId).flatMap((rival) => {
    const count = matches.filter((match) => catches(rival, match)).length;
    return count === 0 ? [] : [{ kind: rival.kind, id: rival.id, name: rival.name, count }];
  });
