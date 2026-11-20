import type { AutomationAction, SimpleAutomationActionType } from '@relay/shared';
import { conflictOf, replaceAction } from '../settings/automations/action-choices';

export type QuickSimpleAction = Extract<
  SimpleAutomationActionType,
  'markRead' | 'archive' | 'pin' | 'notify'
>;

export const NEWSLETTER_ACTIONS: readonly AutomationAction[] = [
  { type: 'markRead' },
  { type: 'archive' },
];

export const toggleQuick = (
  actions: readonly AutomationAction[],
  type: QuickSimpleAction,
): AutomationAction[] => {
  if (actions.some((action) => action.type === type)) {
    return actions.filter((action) => action.type !== type);
  }
  return replaceAction(actions, conflictOf(actions, type), { type });
};

export const withTarget = (
  actions: readonly AutomationAction[],
  picked: AutomationAction,
): AutomationAction[] => {
  const kept = actions.filter((action) => action.type !== picked.type);
  return replaceAction(kept, conflictOf(kept, picked.type), picked);
};

export const withoutType = (
  actions: readonly AutomationAction[],
  type: AutomationAction['type'],
): AutomationAction[] => actions.filter((action) => action.type !== type);
