import {
  type AccountId,
  type AutomationAction,
  PLACEMENT_ACTION_TYPES,
  type SimpleAutomationActionType,
} from '@relay/shared';
import type { RuleChange } from './editable-rule';

const REPLACE_NOTES: Readonly<Partial<Record<AutomationAction['type'], string>>> = {
  moveTo: 'Nahradí presun',
  archive: 'Nahradí archiváciu',
  remind: 'Nahradí pripomenutie',
};

export const conflictOf = (
  actions: readonly AutomationAction[],
  type: AutomationAction['type'],
): AutomationAction | null => {
  if (!PLACEMENT_ACTION_TYPES.includes(type)) {
    return null;
  }
  return (
    actions.find(
      (action) => action.type !== type && PLACEMENT_ACTION_TYPES.includes(action.type),
    ) ?? null
  );
};

export const replaceNoteOf = (
  actions: readonly AutomationAction[],
  type: AutomationAction['type'],
): string | null => {
  const rival = conflictOf(actions, type);
  return rival === null ? null : (REPLACE_NOTES[rival.type] ?? null);
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
