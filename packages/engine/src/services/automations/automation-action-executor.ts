import type { AutomationAction, AutomationActivityAction } from '@relay/shared/domain';
import type { Logger } from '../../ports/logger';
import { errorMessage } from '../shared/mail-provider-sessions';
import type { ActionEffectTracker } from './action-effect-tracker';
import {
  type AutomationActionContext,
  type AutomationActionHandlers,
  orderedActions,
  runAction,
} from './automation-action';

export class AutomationActionExecutor {
  constructor(
    private readonly handlers: AutomationActionHandlers,
    private readonly effects: ActionEffectTracker,
    private readonly logger: Logger,
  ) {}

  async execute(
    context: AutomationActionContext,
    actions: readonly AutomationAction[],
  ): Promise<AutomationActivityAction[]> {
    const outcomes: AutomationActivityAction[] = [];
    for (const action of orderedActions(actions)) {
      outcomes.push(await this.run(context, action));
    }
    return outcomes;
  }

  private async run(
    context: AutomationActionContext,
    action: AutomationAction,
  ): Promise<AutomationActivityAction> {
    try {
      const effect = await this.effects.track(context, action, () =>
        runAction(this.handlers, context, action),
      );
      return { action, outcome: 'ok', ...effect, undo: null };
    } catch (error: unknown) {
      this.logger.warn('An automation action failed', {
        automationId: context.automation.id,
        action: action.type,
        messageId: context.arrival.message.id,
        error: errorMessage(error),
      });
      return { action, outcome: 'failed', changed: [], previousState: null, undo: null };
    }
  }
}
