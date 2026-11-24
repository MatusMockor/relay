import {
  type AutomationActivityAction,
  type AutomationActivityId,
  type AutomationUndoOutcome,
  isPlacedIn,
  type Mailbox,
  type Message,
} from '@relay/shared';
import type { DemoMoves } from './demo-moves';
import type { DemoState, DemoThreadRecord } from './demo-state';

type Reversal = Extract<AutomationUndoOutcome, 'undone' | 'skipped'>;

const FOLDER_ROLES = new Set<Mailbox['role']>(['custom', 'label']);

export class DemoPlacement {
  constructor(
    private readonly state: DemoState,
    private readonly moves: DemoMoves,
  ) {}

  reverse(
    record: DemoThreadRecord,
    entry: AutomationActivityAction,
    activityId: AutomationActivityId,
  ): Reversal {
    const { action } = entry;
    if (action.type === 'markRead') {
      return this.clearFlag(record, entry, 'seen');
    }
    if (action.type === 'pin') {
      return this.clearFlag(record, entry, 'flagged');
    }
    if (action.type === 'addLabel') {
      return this.dropLabel(record, action.labelId);
    }
    if (action.type === 'moveTo') {
      return this.undoMove(record, entry, action.mailboxId, activityId);
    }
    return this.undoArchive(record, entry);
  }

  private clearFlag(
    record: DemoThreadRecord,
    entry: AutomationActivityAction,
    flag: 'seen' | 'flagged',
  ): Reversal {
    const changed = new Set<string>(entry.changed);
    const targets = record.messages.filter(
      (message) => changed.has(message.id) && message.flags[flag],
    );
    if (targets.length === 0) {
      return 'skipped';
    }
    record.messages = record.messages.map((message) =>
      targets.includes(message)
        ? { ...message, flags: { ...message.flags, [flag]: false } }
        : message,
    );
    record.summary = {
      ...record.summary,
      unread: record.messages.some((message) => !message.flags.seen),
    };
    return 'undone';
  }

  private dropLabel(record: DemoThreadRecord, labelId: Message['labelIds'][number]): Reversal {
    if (!record.summary.labelIds.includes(labelId)) {
      return 'skipped';
    }
    this.moves.apply(record, { type: 'removeLabel', labelId });
    return 'undone';
  }

  private undoArchive(record: DemoThreadRecord, entry: AutomationActivityAction): Reversal {
    const archived =
      record.summary.state === 'done' &&
      record.summary.markedDone !== true &&
      !this.inFolder(record, () => true);
    if (entry.previousState !== 'inbox' || !archived) {
      return 'skipped';
    }
    this.moves.apply(record, { type: 'undone' });
    return 'undone';
  }

  private undoMove(
    record: DemoThreadRecord,
    entry: AutomationActivityAction,
    mailboxId: Mailbox['id'],
    activityId: AutomationActivityId,
  ): Reversal {
    if (
      !this.stillMovedTo(record, entry, mailboxId) ||
      !this.moves.ownsOrigin(activityId, record.summary.id)
    ) {
      return 'skipped';
    }
    this.moves.apply(record, { type: 'undoMove' });
    return 'undone';
  }

  private stillMovedTo(
    record: DemoThreadRecord,
    entry: AutomationActivityAction,
    mailboxId: Mailbox['id'],
  ): boolean {
    const target = this.state.mailboxes.find((mailbox) => mailbox.id === mailboxId);
    if (target?.role === 'label') {
      const label = this.state.labels.find(
        (candidate) =>
          candidate.accountId === target.accountId && candidate.remoteName === target.path,
      );
      return label !== undefined && record.summary.labelIds.includes(label.id);
    }
    const changed = new Set<string>(entry.changed);
    return record.messages.some(
      (message) => changed.has(message.id) && isPlacedIn(message, mailboxId),
    );
  }

  private inFolder(record: DemoThreadRecord, matches: (message: Message) => boolean): boolean {
    const folders = new Set(
      this.state.mailboxes
        .filter((mailbox) => FOLDER_ROLES.has(mailbox.role))
        .map((mailbox) => mailbox.id),
    );
    return record.messages.some(
      (message) =>
        message.placements.some((placement) => folders.has(placement.mailboxId)) &&
        matches(message),
    );
  }
}
