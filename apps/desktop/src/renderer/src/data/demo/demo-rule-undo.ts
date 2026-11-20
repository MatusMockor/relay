import {
  type AutomationActivity,
  type AutomationActivityAction,
  type AutomationActionType,
  type AutomationUndoOutcome,
  type AutomationUndoResult,
  isReversibleAction,
  type ThreadSummary,
} from '@relay/shared';
import type { DemoMoves } from './demo-moves';
import type { DemoState, DemoThreadRecord } from './demo-state';

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

const reversed = (actions: readonly AutomationActivityAction[]): AutomationActivityAction[] =>
  [...actions].sort(
    (left, right) => RUN_ORDER.indexOf(right.action.type) - RUN_ORDER.indexOf(left.action.type),
  );

export class DemoRuleUndo {
  constructor(
    private readonly state: DemoState,
    private readonly moves: DemoMoves,
    private readonly upserted: (thread: ThreadSummary) => void,
  ) {}

  undo(activity: AutomationActivity): AutomationUndoResult[] {
    return reversed(activity.actions).map(({ action, outcome }) => ({
      action,
      outcome: this.outcomeOf(activity, action, outcome),
    }));
  }

  private outcomeOf(
    activity: AutomationActivity,
    action: AutomationActivityAction['action'],
    outcome: AutomationActivityAction['outcome'],
  ): AutomationUndoOutcome {
    if (!isReversibleAction(action)) {
      return 'notUndoable';
    }
    const record = this.state.threads.get(activity.threadId);
    if (outcome === 'failed' || record === undefined) {
      return 'skipped';
    }
    const result = this.reverse(record, action);
    if (result === 'undone') {
      this.upserted(record.summary);
    }
    return result;
  }

  private reverse(
    record: DemoThreadRecord,
    action: AutomationActivityAction['action'],
  ): AutomationUndoOutcome {
    if (action.type === 'markRead') {
      this.moves.apply(record, { type: 'markUnread' });
      return 'undone';
    }
    if (action.type === 'pin') {
      this.unpin(record);
      return 'undone';
    }
    if (action.type === 'addLabel') {
      if (!record.summary.labelIds.includes(action.labelId)) {
        return 'skipped';
      }
      this.moves.apply(record, { type: 'removeLabel', labelId: action.labelId });
      return 'undone';
    }
    if (record.summary.state !== 'done') {
      return 'skipped';
    }
    const restored =
      action.type === 'moveTo' ? this.moves.apply(record, { type: 'undoMove' }) : record.summary;
    if (restored.state !== 'inbox') {
      this.backToInbox(record);
    }
    return 'undone';
  }

  private unpin(record: DemoThreadRecord): void {
    const latest = record.messages.at(-1);
    record.messages = record.messages.map((message) =>
      message === latest ? { ...message, flags: { ...message.flags, flagged: false } } : message,
    );
  }

  private backToInbox(record: DemoThreadRecord): void {
    const own = this.state.mailboxes.filter(
      (mailbox) => mailbox.accountId === record.summary.accountId,
    );
    const inbox = own.find((mailbox) => mailbox.role === 'inbox');
    const sent = new Set(own.filter((mailbox) => mailbox.role === 'sent').map(({ id }) => id));
    record.messages = record.messages.map((message) =>
      inbox === undefined || sent.has(message.mailboxId)
        ? message
        : { ...message, mailboxId: inbox.id },
    );
    this.moves.apply(record, { type: 'undone' });
  }
}
