import {
  type AccountId,
  type AiRunnerKind,
  type Automation,
  type AutomationAction,
  type AutomationCondition,
  type AutomationConditionType,
  type AutomationInput,
  type AutomationMatchMode,
  type AutomationPreset,
  isParameterizedAction,
  needsAccountScope,
} from '@relay/shared';
import type { SuggestionNote } from './rule-ai/suggestion-note';
import type { RuleTemplate } from './rule-templates';

export type RuleInput = AutomationInput & {
  readonly match: AutomationMatchMode;
  readonly exceptions: AutomationCondition[];
};

export interface EditableRule {
  readonly key: string;
  readonly preset: AutomationPreset | null;
  readonly saved: boolean;
  readonly pending: AutomationConditionType | null;
  readonly input: RuleInput;
  readonly suggestion?: SuggestionNote;
}

export type RuleChange = Partial<RuleInput>;

export const editableOf = (automation: Automation): EditableRule => ({
  key: automation.id,
  preset: automation.preset,
  saved: true,
  pending: null,
  input: {
    id: automation.id,
    accountId: automation.accountId,
    name: automation.name,
    enabled: automation.enabled,
    order: automation.order,
    match: automation.match,
    conditions: automation.conditions,
    exceptions: automation.exceptions,
    ai: automation.ai,
    actions: automation.actions,
  },
});

export const newRule = (
  key: string,
  runner: AiRunnerKind,
  order: number,
  template: RuleTemplate,
): EditableRule => ({
  key,
  preset: null,
  saved: false,
  pending: template.needs,
  input: {
    accountId: null,
    name: template.name,
    enabled: true,
    order,
    match: 'all',
    conditions: [...template.conditions],
    exceptions: [],
    ai: { runner, model: null, effort: null, instructions: null },
    actions: [...template.actions],
  },
});

export const isComplete = (rule: EditableRule): boolean => rule.input.conditions.length > 0;

export const isStaged = (rule: EditableRule): boolean =>
  rule.saved && rule.suggestion !== undefined;

const DEFAULT_ACTIONS: AutomationAction[] = [{ type: 'task' }];

export const scopeChange = (
  actions: readonly AutomationAction[],
  from: AccountId | null,
  to: AccountId | null,
): RuleChange => {
  if (from === to) {
    return { accountId: to };
  }
  const kept = actions.filter((action) =>
    to === null ? !needsAccountScope(action) : !isParameterizedAction(action),
  );
  return { accountId: to, actions: kept.length === 0 ? DEFAULT_ACTIONS : kept };
};
