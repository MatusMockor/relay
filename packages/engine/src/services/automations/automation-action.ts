import type {
  Automation,
  AutomationAction,
  AutomationActionOf,
  AutomationActionType,
  UserId,
} from '@relay/shared/domain';
import type { InboxArrival } from '../sync/sync-arrivals';

export interface AutomationActionContext {
  readonly userId: UserId;
  readonly automation: Automation;
  readonly arrival: InboxArrival;
}

export interface AutomationActionHandler<Action extends AutomationAction = AutomationAction> {
  run(context: AutomationActionContext, action: Action): Promise<void>;
}

export type AutomationActionHandlers = {
  readonly [Type in AutomationActionType]: AutomationActionHandler<AutomationActionOf<Type>>;
};

export const ACTION_ORDER: readonly AutomationActionType[] = [
  'notify',
  'summary',
  'task',
  'markRead',
  'pin',
  'addLabel',
  'moveTo',
  'archive',
];

const rank = (action: AutomationAction): number => ACTION_ORDER.indexOf(action.type);

export const orderedActions = (actions: readonly AutomationAction[]): AutomationAction[] =>
  [...actions].sort((left, right) => rank(left) - rank(right));

export const runAction = (
  handlers: AutomationActionHandlers,
  context: AutomationActionContext,
  action: AutomationAction,
): Promise<void> => {
  const handler = handlers[action.type] as AutomationActionHandler;
  return handler.run(context, action);
};
