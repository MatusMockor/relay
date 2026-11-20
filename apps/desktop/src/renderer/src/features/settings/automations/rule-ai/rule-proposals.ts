import type { AiRunnerKind, RuleSuggestion } from '@relay/shared';
import type { Dispatch, SetStateAction } from 'react';
import { nextDraftKey } from '../draft-key';
import { type EditableRule, newRule } from '../editable-rule';
import { BLANK_TEMPLATE } from '../rule-templates';
import { applySuggestion } from './apply-suggestion';
import { noteOf } from './suggestion-note';

export type LocalRules = ReadonlyMap<string, EditableRule>;

export interface RuleProposals {
  readonly propose: (key: string, suggestion: RuleSuggestion, sentence: string) => void;
  readonly addProposed: (
    runner: AiRunnerKind,
    suggestion: RuleSuggestion,
    sentence: string,
  ) => string;
  readonly discard: (key: string) => void;
}

export const withoutKey = <Value>(
  map: ReadonlyMap<string, Value>,
  key: string,
): Map<string, Value> => {
  const next = new Map(map);
  next.delete(key);
  return next;
};

const proposed = (rule: EditableRule, suggestion: RuleSuggestion, sentence: string) => ({
  ...rule,
  pending: null,
  input: applySuggestion(rule.input, suggestion),
  suggestion: noteOf(sentence, suggestion),
});

export const ruleProposals = (
  rules: readonly EditableRule[],
  setLocal: Dispatch<SetStateAction<LocalRules>>,
): RuleProposals => ({
  propose: (key, suggestion, sentence) => {
    const rule = rules.find((item) => item.key === key);
    if (rule === undefined) {
      return;
    }
    setLocal((current) => new Map(current).set(key, proposed(rule, suggestion, sentence)));
  },
  addProposed: (runner, suggestion, sentence) => {
    const key = nextDraftKey();
    const draft = newRule(key, runner, rules.length, BLANK_TEMPLATE);
    setLocal((current) => new Map(current).set(key, proposed(draft, suggestion, sentence)));
    return key;
  },
  discard: (key) => {
    setLocal((current) => (current.get(key)?.saved === true ? withoutKey(current, key) : current));
  },
});
