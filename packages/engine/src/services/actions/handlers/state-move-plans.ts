import type {
  MailboxRole,
  Message,
  MessageId,
  ThreadState,
  ThreadSummary,
} from '@relay/shared/domain';
import type { TrashOriginWork } from '../../../model/pending-work';

export type StateMoveAction = 'done' | 'undone' | 'trash' | 'restore';

export interface LocatedMessage {
  readonly message: Message;
  readonly role: MailboxRole | undefined;
  readonly origin: MailboxRole | undefined;
}

export interface PlannedMove {
  readonly messageId: MessageId;
  readonly role: MailboxRole;
}

export interface StateMovePlan {
  readonly state: ThreadState;
  readonly moves: readonly PlannedMove[];
  readonly remember: readonly TrashOriginWork[];
  readonly forget: readonly MessageId[];
}

type StateMovePlanner = (
  messages: readonly LocatedMessage[],
  thread: ThreadSummary,
) => StateMovePlan;

const RESTORE_TARGETS: readonly MailboxRole[] = ['inbox', 'archive', 'sent'];

const inRoles = (messages: readonly LocatedMessage[], roles: readonly MailboxRole[]) =>
  messages.filter(({ role }) => role !== undefined && roles.includes(role));

const plan = (state: ThreadState, moves: readonly PlannedMove[] = []): StateMovePlan => ({
  state,
  moves,
  remember: [],
  forget: [],
});

const moveTo = (state: ThreadState, sources: readonly LocatedMessage[], role: MailboxRole) =>
  plan(
    state,
    sources.map(({ message }) => ({ messageId: message.id, role })),
  );

const trashSources = (messages: readonly LocatedMessage[]): LocatedMessage[] => {
  const received = inRoles(messages, ['inbox', 'archive']);
  return received.length > 0 ? received : inRoles(messages, ['sent']);
};

const trash: StateMovePlanner = (messages, thread) => {
  if (thread.state === 'trash') {
    return plan('trash');
  }
  const sources = trashSources(messages);
  return {
    ...moveTo('trash', sources, 'trash'),
    remember: sources.flatMap(({ message, role }) =>
      role === undefined ? [] : [{ messageId: message.id, role }],
    ),
  };
};

const restoredState = (moves: readonly PlannedMove[]): ThreadState => {
  if (moves.length > 0 && moves.every((move) => move.role !== 'inbox')) {
    return 'done';
  }
  return 'inbox';
};

const restoreTarget = (origin: MailboxRole | undefined): MailboxRole =>
  origin !== undefined && RESTORE_TARGETS.includes(origin) ? origin : 'inbox';

const restore: StateMovePlanner = (messages) => {
  const moves = inRoles(messages, ['trash']).map(({ message, origin }) => ({
    messageId: message.id,
    role: restoreTarget(origin),
  }));
  return {
    ...plan(restoredState(moves), moves),
    forget: moves.map((move) => move.messageId),
  };
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
  thread: ThreadSummary,
): StateMovePlan => PLANNERS[action](messages, thread);
