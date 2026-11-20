import type {
  AutomationAction,
  AutomationCriteria,
  AutomationMatchMode,
  SimpleAutomationActionType,
} from '@relay/shared';
import { type ActionTargets, describeAction } from './action-targets';
import { AI_ACTIONS, describeCondition } from './automation-labels';
import { actionPhrase, conditionPhrase, joinPhrases } from './rule-phrases';
import type { RuleInput } from './editable-rule';

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const MATCH_JOINERS: Readonly<Record<AutomationMatchMode, 'a' | 'alebo'>> = {
  all: 'a',
  any: 'alebo',
};

export const summarizeConditions = (criteria: AutomationCriteria): string => {
  const conditions = criteria.conditions
    .map(describeCondition)
    .join(` ${MATCH_JOINERS[criteria.match]} `);
  if (criteria.exceptions.length === 0) {
    return capitalize(conditions);
  }
  return capitalize(
    `${conditions}, okrem: ${criteria.exceptions.map(describeCondition).join(' alebo ')}`,
  );
};

export const summarizeActions = (
  actions: readonly AutomationAction[],
  targets: ActionTargets,
): string => actions.map((action) => describeAction(action, targets).label).join(', ');

export const describeRule = (
  input: RuleInput,
  targets: ActionTargets,
  accountName: string | null,
): string => {
  if (input.conditions.length === 0) {
    return 'Pravidlo zatiaľ nemá žiadnu podmienku.';
  }
  const where = accountName === null ? '' : ` do účtu ${accountName}`;
  const conditions = joinPhrases(input.conditions.map(conditionPhrase), MATCH_JOINERS[input.match]);
  const exceptions =
    input.exceptions.length === 0
      ? ''
      : `, okrem mailov ${joinPhrases(input.exceptions.map(conditionPhrase), 'alebo')}`;
  const actions = joinPhrases(
    input.actions.map((action) => actionPhrase(action, targets)),
    'a',
  );
  return `Keď príde mail${where} ${conditions}${exceptions}, ${actions}.`;
};

export const firstAiAction = (
  actions: readonly AutomationAction[],
): SimpleAutomationActionType | null =>
  actions
    .map((action) => action.type)
    .find((type): type is SimpleAutomationActionType => AI_ACTIONS.some((ai) => ai === type)) ??
  null;
