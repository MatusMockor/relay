import {
  type AutomationActivity,
  type AutomationActivityAction,
  type AutomationActionType,
  type AutomationUndoOutcome,
  isReversibleAction,
  type ThreadSummary,
} from '@relay/shared';
import type { DemoMoves } from './demo-moves';
import { DemoPlacement } from './demo-placement';
import type { DemoState } from './demo-state';

const RUN_ORDER: readonly AutomationActionType[] = [
  'notify',
  'summary',
  'task',
  'markRead',
  'pin',
  'addLabel',
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
    moves: DemoMoves,
    private readonly upserted: (thread: ThreadSummary) => void,
  ) {
    this.placement = new DemoPlacement(state, moves);
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
      entry.changed.length === 0 ||
      record === undefined ||
      HELD.has(record.summary.state)
    ) {
      return 'skipped';
    }
    const result = this.placement.reverse(record, entry);
    if (result === 'undone') {
      this.upserted(record.summary);
    }
    return result;
  }
}
