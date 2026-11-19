import type {
  AutomationAction,
  AutomationCondition,
  SimpleAutomationActionType,
} from '@relay/shared';
import { type ActionTargets, describeAction } from './action-targets';
import { AI_ACTIONS, describeCondition } from './automation-labels';

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const summarizeConditions = (conditions: readonly AutomationCondition[]): string =>
  capitalize(conditions.map(describeCondition).join(' a '));

export const summarizeActions = (
  actions: readonly AutomationAction[],
  targets: ActionTargets,
): string => actions.map((action) => describeAction(action, targets).label).join(', ');

export const firstAiAction = (
  actions: readonly AutomationAction[],
): SimpleAutomationActionType | null =>
  actions
    .map((action) => action.type)
    .find((type): type is SimpleAutomationActionType => AI_ACTIONS.some((ai) => ai === type)) ??
  null;

export const usesAi = (actions: readonly AutomationAction[]): boolean =>
  firstAiAction(actions) !== null;
