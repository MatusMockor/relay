import type { AutomationAction, SimpleAutomationActionType } from '@relay/shared';
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
