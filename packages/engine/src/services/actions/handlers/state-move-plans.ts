import type {
  MailAccount,
  MailboxRole,
  Message,
  MessageId,
  ThreadState,
} from '@relay/shared/domain';

export type StateMoveAction = 'done' | 'undone' | 'trash' | 'restore';

export interface LocatedMessage {
  readonly message: Message;
  readonly role: MailboxRole | undefined;
}

export interface StateMovePlan {
  readonly state: ThreadState;
  readonly moves: readonly { readonly messageId: MessageId; readonly role: MailboxRole }[];
}

type StateMovePlanner = (
  messages: readonly LocatedMessage[],
  account: MailAccount,
) => StateMovePlan;

const inRoles = (messages: readonly LocatedMessage[], roles: readonly MailboxRole[]) =>
  messages.filter(({ role }) => role !== undefined && roles.includes(role));

const moveTo = (
  state: ThreadState,
  sources: readonly LocatedMessage[],
  role: MailboxRole,
): StateMovePlan => ({
  state,
  moves: sources.map(({ message }) => ({ messageId: message.id, role })),
});

const sentByAccount = (account: MailAccount, { message }: LocatedMessage): boolean =>
  message.from?.email.toLowerCase() === account.email.toLowerCase();

const trash: StateMovePlanner = (messages) => {
  const received = inRoles(messages, ['inbox', 'archive']);
  if (received.length > 0) {
    return moveTo('trash', received, 'trash');
  }
  return moveTo('trash', inRoles(messages, ['sent']), 'trash');
};

const restore: StateMovePlanner = (messages, account) => {
  const trashed = inRoles(messages, ['trash']);
  const sentOnly =
    trashed.length > 0 && trashed.every((located) => sentByAccount(account, located));
  if (sentOnly) {
    return moveTo('done', trashed, 'sent');
  }
  return moveTo('inbox', trashed, 'inbox');
};

const PLANNERS: Readonly<Record<StateMoveAction, StateMovePlanner>> = {
  done: (messages) => moveTo('done', inRoles(messages, ['inbox']), 'archive'),
  undone: (messages) => moveTo('inbox', inRoles(messages, ['archive']), 'inbox'),
  trash,
  restore,
};

export const planStateMove = (
  action: StateMoveAction,
  messages: readonly LocatedMessage[],
  account: MailAccount,
): StateMovePlan => PLANNERS[action](messages, account);
