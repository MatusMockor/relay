import type { RuleSuggestion } from '@relay/shared';
import type { RuleInput } from '../editable-rule';

export const applySuggestion = (input: RuleInput, suggestion: RuleSuggestion): RuleInput => ({
  ...input,
  name: suggestion.name,
  accountId: suggestion.accountId,
  match: suggestion.match,
  conditions: suggestion.conditions,
  exceptions: suggestion.exceptions,
  actions: suggestion.actions,
});

export const suggestionBasis = (input: RuleInput): string =>
  JSON.stringify([
    input.name,
    input.accountId,
    input.match,
    input.conditions,
    input.exceptions,
    input.actions,
  ]);
