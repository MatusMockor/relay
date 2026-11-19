import type { AutomationAction, AutomationCondition } from '@relay/shared';
import { type ActionTargets, describeAction } from './action-targets';
import { AI_ACTIONS, describeCondition } from './automation-labels';

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const summarizeConditions = (conditions: readonly AutomationCondition[]): string =>
  capitalize(conditions.map(describeCondition).join(' a '));

export const summarizeActions = (
  actions: readonly AutomationAction[],
  targets: ActionTargets,
): string => actions.map((action) => describeAction(action, targets).label).join(', ');

export const usesAi = (actions: readonly AutomationAction[]): boolean =>
  actions.some((action) => AI_ACTIONS.includes(action.type));
