import type { LabelId, MailboxId, Message, ThreadState, ThreadSummary } from '@relay/shared/domain';
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
  readonly before: readonly Message[];
  readonly written: readonly Message[];
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
