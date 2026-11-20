import {
  AUTOMATION_HISTORY_DAYS,
  AUTOMATION_HISTORY_LIMIT,
  type AutomationHistoryResponse,
  type UndoAutomationActivityResponse,
  type UndoAutomationSinceResponse,
} from '@relay/shared/api';
import {
  type AutomationActivity,
  type AutomationActivityId,
  type AutomationId,
  isUndoableActivity,
  type UserId,
} from '@relay/shared/domain';
import { NotFoundError } from '../../../errors';
import type { AutomationActivityRepository } from '../../../ports/automation-activity-repository';
import type { AutomationRepository } from '../../../ports/automation-repository';
import type { Clock } from '../../../ports/clock';
import { KeyedSerializer } from '../../shared/keyed-serializer';
import type { AutomationActivityUndo } from './automation-activity-undo';

const DAY_MS = 24 * 60 * 60_000;

export interface AutomationHistoryServiceDeps {
  readonly automations: AutomationRepository;
  readonly activity: AutomationActivityRepository;
  readonly undo: AutomationActivityUndo;
  readonly clock: Clock;
}

export class AutomationHistoryService {
  private readonly serializer = new KeyedSerializer();

  constructor(private readonly deps: AutomationHistoryServiceDeps) {}

  async history(userId: UserId, automationId: AutomationId): Promise<AutomationHistoryResponse> {
    await this.assertAutomation(userId, automationId);
    const since = new Date(
      this.deps.clock.now().getTime() - AUTOMATION_HISTORY_DAYS * DAY_MS,
    ).toISOString();
    const stats = await this.deps.activity.stats(userId, automationId, since);
    const entries = await this.deps.activity.listRecent(
      userId,
      automationId,
      AUTOMATION_HISTORY_LIMIT,
    );
    return {
      stats: { days: AUTOMATION_HISTORY_DAYS, ...stats, lastRunAt: entries[0]?.createdAt ?? null },
      entries,
    };
  }

  undo(
    userId: UserId,
    automationId: AutomationId,
    activityId: AutomationActivityId,
  ): Promise<UndoAutomationActivityResponse> {
    return this.serializer.run(userId, async () => {
      await this.assertAutomation(userId, automationId);
      const activity = await this.deps.activity.findById(userId, activityId);
      if (activity?.automationId !== automationId) {
        throw new NotFoundError('AutomationActivity', activityId);
      }
      return this.undoNow(userId, activity);
    });
  }

  undoSince(
    userId: UserId,
    automationId: AutomationId,
    since: string,
  ): Promise<UndoAutomationSinceResponse> {
    return this.serializer.run(userId, async () => {
      await this.assertAutomation(userId, automationId);
      const open = await this.deps.activity.listOpenSince(userId, automationId, since);
      const undoable = open.filter(isUndoableActivity);
      let undone = 0;
      for (const activity of undoable) {
        const { entry } = await this.undoNow(userId, activity);
        undone += entry.undoneAt === null ? 0 : 1;
      }
      return { entries: undoable.length, undone, failed: undoable.length - undone };
    });
  }

  private async undoNow(
    userId: UserId,
    activity: AutomationActivity,
  ): Promise<UndoAutomationActivityResponse> {
    if (activity.undoneAt !== null) {
      return { entry: activity, alreadyUndone: true, results: [] };
    }
    const actions = await this.deps.undo.undo(userId, activity);
    const outcomes = actions.map(({ undo }) => undo);
    const settled =
      outcomes.every((outcome) => outcome !== 'failed') &&
      outcomes.some((outcome) => outcome !== 'notUndoable');
    const undoneAt = settled ? this.deps.clock.now().toISOString() : null;
    const saved = await this.deps.activity.recordUndo(userId, activity.id, actions, undoneAt);
    return {
      entry: saved ? { ...activity, actions, undoneAt } : activity,
      alreadyUndone: false,
      results: actions.map(({ action, undo }) => ({ action, outcome: undo ?? 'skipped' })),
    };
  }

  private async assertAutomation(userId: UserId, automationId: AutomationId): Promise<void> {
    const automations = await this.deps.automations.listByUser(userId);
    if (!automations.some((automation) => automation.id === automationId)) {
      throw new NotFoundError('Automation', automationId);
    }
  }
}
