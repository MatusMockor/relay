import type { RuleSuggestion } from '@relay/shared';
import { type RuleInput, scopeChange } from '../editable-rule';

export const applySuggestion = (input: RuleInput, suggestion: RuleSuggestion): RuleInput => {
  const scoped = scopeChange(input.actions, input.accountId, suggestion.accountId);
  return {
    ...input,
    name: suggestion.name,
    accountId: suggestion.accountId,
    match: suggestion.match,
    conditions: suggestion.conditions,
    exceptions: suggestion.exceptions,
    actions: suggestion.actions.length > 0 ? suggestion.actions : (scoped.actions ?? input.actions),
  };
};
