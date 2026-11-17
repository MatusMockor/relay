import type { Automation, AutomationAction, UserId } from '@relay/shared/domain';
import type { InboxArrival } from '../sync/sync-arrivals';

export interface AutomationActionContext {
  readonly userId: UserId;
  readonly automation: Automation;
  readonly arrival: InboxArrival;
}

export interface AutomationActionHandler {
  run(context: AutomationActionContext): Promise<void>;
}

export type AutomationActionHandlers = {
  readonly [Action in AutomationAction]: AutomationActionHandler;
};

export const ACTION_ORDER: readonly AutomationAction[] = [
  'notify',
  'summary',
  'task',
  'markRead',
  'pin',
  'archive',
];
