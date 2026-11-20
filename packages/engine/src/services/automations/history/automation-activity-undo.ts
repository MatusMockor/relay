import type { AutomationUndoOutcome, AutomationUndoResult } from '@relay/shared/api';
import type { AutomationActivity, AutomationActivityAction, UserId } from '@relay/shared/domain';
import type { Logger } from '../../../ports/logger';
import type { ThreadRepository } from '../../../ports/thread-repository';
import { errorMessage } from '../../shared/mail-provider-sessions';
import {
  type ActivityReverser,
  type ActivityReversers,
  isReversible,
  reverseRank,
} from './activity-reverser';

const byReverseOrder = (left: AutomationActivityAction, right: AutomationActivityAction): number =>
  reverseRank(left.action) - reverseRank(right.action);

export class AutomationActivityUndo {
  constructor(
    private readonly reversers: ActivityReversers,
    private readonly threads: ThreadRepository,
    private readonly logger: Logger,
  ) {}

  async undo(userId: UserId, activity: AutomationActivity): Promise<AutomationUndoResult[]> {
    const results: AutomationUndoResult[] = [];
    for (const entry of [...activity.actions].sort(byReverseOrder)) {
      results.push({
        action: entry.action,
        outcome: await this.outcomeOf(userId, activity, entry),
      });
    }
    return results;
  }

  private async outcomeOf(
    userId: UserId,
    activity: AutomationActivity,
    { action, outcome }: AutomationActivityAction,
  ): Promise<AutomationUndoOutcome> {
    if (!isReversible(action)) {
      return 'notUndoable';
    }
    if (outcome === 'failed') {
      return 'skipped';
    }
    const thread = await this.threads.findById(userId, activity.threadId);
    if (thread === null) {
      return 'skipped';
    }
    const reverser = this.reversers[action.type] as ActivityReverser;
    return reverser.reverse(userId, thread, action).catch((error: unknown) => {
      this.logger.warn('Undoing an automation action failed', {
        automationId: activity.automationId,
        activityId: activity.id,
        action: action.type,
        error: errorMessage(error),
      });
      return 'failed' as const;
    });
  }
}
