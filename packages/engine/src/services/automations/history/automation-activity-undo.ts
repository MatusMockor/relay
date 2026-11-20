import type {
  AutomationActivity,
  AutomationActivityAction,
  AutomationUndoOutcome,
  UserId,
} from '@relay/shared/domain';
import type { Logger } from '../../../ports/logger';
import type { ThreadRepository } from '../../../ports/thread-repository';
import { errorMessage } from '../../shared/mail-provider-sessions';
import {
  type ActivityReverser,
  type ActivityReversers,
  isRecordedReversible,
  type RecordedAction,
  reverseRank,
} from './activity-reverser';

const HELD_STATES = new Set(['trash', 'spam']);

const isSettled = (entry: AutomationActivityAction): boolean =>
  entry.undo !== null && entry.undo !== 'failed';

export class AutomationActivityUndo {
  constructor(
    private readonly reversers: ActivityReversers,
    private readonly threads: ThreadRepository,
    private readonly logger: Logger,
  ) {}

  async undo(userId: UserId, activity: AutomationActivity): Promise<AutomationActivityAction[]> {
    const actions = [...activity.actions];
    const order = actions
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => reverseRank(left.entry.action) - reverseRank(right.entry.action));
    for (const { entry, index } of order) {
      if (isSettled(entry)) {
        continue;
      }
      actions[index] = { ...entry, undo: await this.outcomeOf(userId, activity, entry) };
    }
    return actions;
  }

  private async outcomeOf(
    userId: UserId,
    activity: AutomationActivity,
    entry: AutomationActivityAction,
  ): Promise<AutomationUndoOutcome> {
    if (!isRecordedReversible(entry)) {
      return 'notUndoable';
    }
    if (entry.outcome === 'failed' || entry.changed.length === 0) {
      return 'skipped';
    }
    return this.reverse(userId, activity, entry).catch((error: unknown) => {
      this.logger.warn('Undoing an automation action failed', {
        automationId: activity.automationId,
        activityId: activity.id,
        action: entry.action.type,
        error: errorMessage(error),
      });
      return 'failed' as const;
    });
  }

  private async reverse(
    userId: UserId,
    activity: AutomationActivity,
    entry: RecordedAction,
  ): Promise<AutomationUndoOutcome> {
    const thread = await this.threads.findById(userId, activity.threadId);
    if (thread === null || HELD_STATES.has(thread.state)) {
      return 'skipped';
    }
    const reverser = this.reversers[entry.action.type] as ActivityReverser;
    return reverser.reverse(userId, thread, entry);
  }
}
