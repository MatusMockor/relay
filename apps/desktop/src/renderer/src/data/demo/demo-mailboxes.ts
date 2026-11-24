import { type AccountId, isPlacedIn, type Mailbox } from '@relay/shared';
import type { DemoState } from './demo-state';

const countsOf = (
  state: DemoState,
  mailbox: Mailbox,
): Pick<Mailbox, 'unreadCount' | 'totalCount'> => {
  const messages = [...state.threads.values()]
    .flatMap((record) => record.messages)
    .filter((message) => isPlacedIn(message, mailbox.id));
  return {
    unreadCount: messages.filter((message) => !message.flags.seen).length,
    totalCount: messages.length,
  };
};

export const demoMailboxesOf = (state: DemoState, accountId: AccountId): Mailbox[] =>
  state.mailboxes
    .filter((mailbox) => mailbox.accountId === accountId)
    .map((mailbox) => ({ ...mailbox, ...countsOf(state, mailbox) }));
