import type { AccountId, AutomationAction, SimpleAutomationActionType } from '@relay/shared';
import type { RuleChange } from './editable-rule';

const EXCLUSIVE: Readonly<Partial<Record<AutomationAction['type'], AutomationAction['type']>>> = {
  archive: 'moveTo',
  moveTo: 'archive',
};

export const conflictOf = (
  actions: readonly AutomationAction[],
  type: AutomationAction['type'],
): AutomationAction | null => {
  const rival = EXCLUSIVE[type];
  return actions.find((action) => action.type === rival) ?? null;
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
  if (existing !== undefined) {
    return withoutAction(actions, existing);
  }
  return replaceAction(actions, conflictOf(actions, type), { type });
};

export const pickedTarget = (
  actions: AutomationAction[],
  picked: AccountId,
  accountId: AccountId | null,
): RuleChange => (picked === accountId ? { actions } : { actions, accountId: picked });
