import type {
  LabelId,
  MailboxId,
  Message,
  MessageId,
  MoveOriginRef,
  ThreadState,
  ThreadSummary,
} from '@relay/shared/domain';
import { labelTargets, pinTargets, unreadTargets } from './handlers/action-targets';

export type MessageRevert =
  | { readonly type: 'markUnread' }
  | { readonly type: 'unpin' }
  | { readonly type: 'removeLabel'; readonly labelId: LabelId }
  | { readonly type: 'returnToInbox' };

export type TrackedAction =
  | { readonly type: 'markRead' }
  | { readonly type: 'pin' }
  | { readonly type: 'addLabel'; readonly labelId: LabelId }
  | { readonly type: 'archive' }
  | { readonly type: 'move'; readonly mailboxId: MailboxId };

export interface TrackedChange {
  readonly thread: ThreadSummary;
  readonly previousState: ThreadState;
  readonly written: readonly MessageId[];
  readonly origins: readonly MoveOriginRef[];
}

export const writtenBy = (action: TrackedAction, messages: readonly Message[]): Message[] => {
  switch (action.type) {
    case 'markRead':
      return unreadTargets(messages);
    case 'pin':
      return pinTargets(messages);
    case 'addLabel':
      return labelTargets(messages, action.labelId, true);
    case 'archive':
    case 'move':
      return [];
  }
};

const applied = (action: TrackedAction, message: Message): boolean => {
  switch (action.type) {
    case 'markRead':
      return message.flags.seen;
    case 'pin':
      return message.flags.flagged;
    case 'addLabel':
      return message.labelIds.includes(action.labelId);
    case 'archive':
    case 'move':
      return false;
  }
};

export const isCommitted = (
  action: TrackedAction,
  written: readonly Message[],
  current: readonly Message[],
): boolean => {
  const now = new Map(current.map((message) => [message.id, message]));
  return (
    written.length > 0 &&
    written.every((message) => {
      const stored = now.get(message.id);
      return stored !== undefined && applied(action, stored);
    })
  );
};
