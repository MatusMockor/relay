import type { AccountId, AutomationAction, SimpleAutomationActionType } from '@relay/shared';
import type { RuleChange } from './editable-rule';
import { SIMPLE_ACTIONS } from './automation-labels';

export interface ActionChoices {
  readonly simple: readonly SimpleAutomationActionType[];
  readonly move: boolean;
}

export const choicesFor = (
  actions: readonly AutomationAction[],
  current: AutomationAction | null,
): ActionChoices => {
  const types = new Set(
    actions.filter((action) => action !== current).map((action) => action.type),
  );
  return {
    simple: SIMPLE_ACTIONS.filter(
      (type) => !types.has(type) && !(type === 'archive' && types.has('moveTo')),
    ),
    move: !types.has('moveTo') && !types.has('archive'),
  };
};

export const replaceAction = (
  actions: readonly AutomationAction[],
  current: AutomationAction | null,
  next: AutomationAction,
): AutomationAction[] =>
  current === null ? [...actions, next] : actions.map((item) => (item === current ? next : item));

export const withoutAction = (
  actions: readonly AutomationAction[],
  removed: AutomationAction,
): AutomationAction[] | null =>
  actions.length > 1 ? actions.filter((item) => item !== removed) : null;

export const toggleSimple = (
  actions: readonly AutomationAction[],
  type: SimpleAutomationActionType,
): AutomationAction[] | null => {
  const existing = actions.find((action) => action.type === type);
  return existing === undefined ? [...actions, { type }] : withoutAction(actions, existing);
};

export const pickedTarget = (
  actions: AutomationAction[],
  picked: AccountId,
  accountId: AccountId | null,
): RuleChange => (picked === accountId ? { actions } : { actions, accountId: picked });
