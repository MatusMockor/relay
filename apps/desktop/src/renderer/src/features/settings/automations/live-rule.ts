import type { AutomationCondition } from '@relay/shared';
import type { ConditionRows } from './condition-rows';
import type { RuleInput } from './editable-rule';
import type { LiveDraft } from './use-live-drafts';

export const liveConditions = (
  saved: readonly AutomationCondition[],
  rows: ConditionRows,
  drafts: ReadonlyMap<string, LiveDraft>,
): AutomationCondition[] => {
  const kept = rows.ids.flatMap((id, index) => {
    const condition = drafts.get(id) ?? saved[index];
    return condition === undefined ? [] : [condition];
  });
  const pending = rows.pending === null ? null : (drafts.get(rows.pending.id) ?? null);
  return pending === null ? kept : [...kept, pending];
};

export const withLiveDrafts = (
  input: RuleInput,
  conditions: ConditionRows,
  exceptions: ConditionRows,
  drafts: ReadonlyMap<string, LiveDraft>,
): RuleInput => ({
  ...input,
  conditions: liveConditions(input.conditions, conditions, drafts),
  exceptions: liveConditions(input.exceptions, exceptions, drafts),
});
