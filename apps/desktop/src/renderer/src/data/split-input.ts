import {
  type AutomationCondition,
  type AutomationMatchMode,
  isSplitRuleType,
  type Split,
  type SplitInput,
  type SplitRule,
} from '@relay/shared';

export type SplitDraft = SplitInput & {
  readonly match: AutomationMatchMode;
  readonly exceptions: SplitRule[];
};

export const splitInputOf = (split: Split): SplitDraft => ({
  id: split.id,
  accountId: split.accountId,
  name: split.name,
  order: split.order,
  match: split.match,
  rules: split.rules,
  exceptions: split.exceptions,
  exclusive: split.exclusive,
  hideTasks: split.hideTasks,
});

const isSplitRule = (condition: AutomationCondition): condition is SplitRule =>
  isSplitRuleType(condition.type);

export const toSplitRules = (conditions: readonly AutomationCondition[]): SplitRule[] =>
  conditions.filter(isSplitRule);
