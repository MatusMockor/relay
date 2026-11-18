import {
  type AccountId,
  type AiRunnerKind,
  type Automation,
  type AutomationAction,
  type AutomationInput,
  type AutomationPreset,
  isParameterizedAction,
} from '@relay/shared';

export interface EditableRule {
  readonly key: string;
  readonly preset: AutomationPreset | null;
  readonly saved: boolean;
  readonly input: AutomationInput;
}

export type RuleChange = Partial<AutomationInput>;

export const editableOf = (automation: Automation): EditableRule => ({
  key: automation.id,
  preset: automation.preset,
  saved: true,
  input: {
    id: automation.id,
    accountId: automation.accountId,
    name: automation.name,
    enabled: automation.enabled,
    order: automation.order,
    conditions: automation.conditions,
    ai: automation.ai,
    actions: automation.actions,
  },
});

export const newRule = (key: string, runner: AiRunnerKind, order: number): EditableRule => ({
  key,
  preset: null,
  saved: false,
  input: {
    accountId: null,
    name: 'Nové pravidlo',
    enabled: true,
    order,
    conditions: [],
    ai: { runner, model: null, effort: null, instructions: null },
    actions: [{ type: 'task' }],
  },
});

export const isComplete = (rule: EditableRule): boolean => rule.input.conditions.length > 0;

const DEFAULT_ACTIONS: AutomationAction[] = [{ type: 'task' }];

export const scopeChange = (
  actions: readonly AutomationAction[],
  from: AccountId | null,
  to: AccountId | null,
): RuleChange => {
  if (from === to) {
    return { accountId: to };
  }
  const kept = actions.filter((action) => !isParameterizedAction(action));
  return { accountId: to, actions: kept.length === 0 ? DEFAULT_ACTIONS : kept };
};
