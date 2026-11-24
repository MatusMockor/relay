import type { AutomationAction, SimpleAutomationActionType } from '@relay/shared';
import { conflictOf, replaceAction } from '../settings/automations/action-choices';
import { DEFAULT_REMIND_DAYS } from '../settings/automations/action-params';

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

export const toggleRemind = (actions: readonly AutomationAction[]): AutomationAction[] => {
  if (actions.some((action) => action.type === 'remind')) {
    return withoutType(actions, 'remind');
  }
  return replaceAction(actions, conflictOf(actions, 'remind'), {
    type: 'remind',
    afterDays: DEFAULT_REMIND_DAYS,
  });
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
