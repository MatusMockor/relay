import {
  type AutomationActivity,
  type AutomationActivityAction,
  type AutomationActionType,
  type AutomationUndoOutcome,
  hasRecordedChange,
  isReversibleAction,
  type ThreadSummary,
} from '@relay/shared';
import type { DemoMoves } from './demo-moves';
import { DemoPlacement } from './demo-placement';
import type { DemoState, DemoThreadRecord } from './demo-state';

const RUN_ORDER: readonly AutomationActionType[] = [
  'notify',
  'summary',
  'task',
  'draftReply',
  'forward',
  'markRead',
  'pin',
  'addLabel',
  'remind',
  'moveTo',
  'archive',
];

const HELD = new Set(['trash', 'spam']);

const isSettled = ({ undo }: AutomationActivityAction): boolean =>
  undo !== null && undo !== 'failed';

export class DemoRuleUndo {
  private readonly placement: DemoPlacement;

  constructor(
    private readonly state: DemoState,
    private readonly moves: DemoMoves,
    private readonly upserted: (thread: ThreadSummary) => void,
  ) {
    this.placement = new DemoPlacement(state, moves);
  }

  private cancelReminder(
    record: DemoThreadRecord,
    { reminder }: AutomationActivityAction,
  ): AutomationUndoOutcome {
    const { state, remindAt } = record.summary;
    if (reminder === null || state !== 'reminder' || remindAt !== reminder.remindAt) {
      return 'skipped';
    }
    this.moves.apply(record, { type: 'cancelReminder' });
    return 'undone';
  }

  undo(activity: AutomationActivity): AutomationActivityAction[] {
    const actions = [...activity.actions];
    const order = actions
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) =>
          RUN_ORDER.indexOf(right.entry.action.type) - RUN_ORDER.indexOf(left.entry.action.type),
      );
    order.forEach(({ entry, index }) => {
      if (isSettled(entry)) {
        return;
      }
      actions[index] = { ...entry, undo: this.outcomeOf(activity, entry) };
    });
    return actions;
  }

  private outcomeOf(
    activity: AutomationActivity,
    entry: AutomationActivityAction,
  ): AutomationUndoOutcome {
    if (!isReversibleAction(entry.action)) {
      return 'notUndoable';
    }
    const record = this.state.threads.get(activity.threadId);
    if (
      entry.outcome === 'failed' ||
      !hasRecordedChange(entry) ||
      record === undefined ||
      HELD.has(record.summary.state)
    ) {
      return 'skipped';
    }
    const result =
      entry.action.type === 'remind'
        ? this.cancelReminder(record, entry)
        : this.placement.reverse(record, entry, activity.id);
    if (result === 'undone') {
      this.upserted(record.summary);
    }
    return result;
  }
}
