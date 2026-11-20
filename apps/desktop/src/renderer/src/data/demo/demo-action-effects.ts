import {
  type AutomationAction,
  type AutomationActivityAction,
  type AutomationActivityReminder,
  type Message,
  type MessageId,
  ReminderIdSchema,
  type ThreadAction,
  type ThreadSummary,
} from '@relay/shared';
import type { DemoMoves } from './demo-moves';
import type { DemoThreadRecord } from './demo-state';

interface Snapshot {
  readonly messages: readonly Message[];
  readonly summary: ThreadSummary;
}

const idsOf = (messages: readonly Message[]): MessageId[] => messages.map(({ id }) => id);

const gainedFlag = (
  before: Snapshot,
  after: Snapshot,
  read: (message: Message) => boolean,
): MessageId[] =>
  idsOf(
    after.messages.filter((message) => {
      const previous = before.messages.find((candidate) => candidate.id === message.id);
      return previous !== undefined && !read(previous) && read(message);
    }),
  );

const changedOf = (action: AutomationAction, before: Snapshot, after: Snapshot): MessageId[] => {
  if (action.type === 'markRead') {
    return gainedFlag(before, after, (message) => message.flags.seen);
  }
  if (action.type === 'pin') {
    return gainedFlag(before, after, (message) => message.flags.flagged);
  }
  if (action.type === 'addLabel') {
    const gained =
      !before.summary.labelIds.includes(action.labelId) &&
      after.summary.labelIds.includes(action.labelId);
    return gained ? idsOf(after.messages.slice(-1)) : [];
  }
  if (action.type === 'moveTo') {
    return idsOf(
      before.messages.filter((message) =>
        after.messages.some(
          (moved) => moved.id === message.id && moved.mailboxId !== message.mailboxId,
        ),
      ),
    );
  }
  if (action.type === 'archive') {
    return before.summary.state !== after.summary.state ? idsOf(after.messages) : [];
  }
  return [];
};

const reminderOf = (
  threadAction: ThreadAction,
  thread: ThreadSummary,
): AutomationActivityReminder | null => {
  if (threadAction.type !== 'remind' || thread.remindAt !== threadAction.at) {
    return null;
  }
  return { id: ReminderIdSchema.parse(`reminder-${thread.id}`), remindAt: threadAction.at };
};

export const trackDemoAction = (
  record: DemoThreadRecord,
  moves: DemoMoves,
  action: AutomationAction,
  threadAction: ThreadAction,
): { readonly thread: ThreadSummary; readonly recorded: AutomationActivityAction } => {
  const before: Snapshot = { messages: record.messages, summary: record.summary };
  const thread = moves.apply(record, threadAction);
  return {
    thread,
    recorded: {
      action,
      outcome: 'ok',
      changed: changedOf(action, before, { messages: record.messages, summary: thread }),
      previousState: before.summary.state,
      origins: [],
      labelled: [],
      reminder: reminderOf(threadAction, thread),
      undo: null,
      reason: null,
    },
  };
};
