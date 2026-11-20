import type { AccountId, AiRunnerKind, AutomationAction, AutomationCondition } from '@relay/shared';
import type { RuleInput } from '../settings/automations/editable-rule';

export interface MailRuleParts {
  readonly accountId: AccountId;
  readonly name: string;
  readonly conditions: readonly AutomationCondition[];
  readonly actions: readonly AutomationAction[];
  readonly runner: AiRunnerKind;
  readonly order: number;
}

export const mailRuleInput = (parts: MailRuleParts): RuleInput => ({
  accountId: parts.accountId,
  name: parts.name,
  enabled: true,
  order: parts.order,
  match: 'all',
  conditions: [...parts.conditions],
  exceptions: [],
  ai: { runner: parts.runner, model: null, effort: null, instructions: null },
  actions: [...parts.actions],
});

export const isCreatable = (input: RuleInput): boolean =>
  input.conditions.length > 0 && input.actions.length > 0;
