import type {
  MailboxRole,
  Message,
  MessageId,
  ThreadState,
  ThreadSummary,
} from '@relay/shared/domain';
import type { MoveOriginWork } from '../../../model/pending-work';
import type { MailCopies } from '../../shared/mail-copies';
import type { MoveOriginKind } from '../../shared/move-origins';

export type StateMoveAction = 'done' | 'undone' | 'trash' | 'restore' | 'reportSpam' | 'notSpam';

export interface LocatedMessage {
  readonly message: Message;
  readonly role: MailboxRole | undefined;
  readonly origin: MailboxRole | undefined;
  readonly moving: boolean;
}

export interface PlannedMove {
  readonly messageId: MessageId;
  readonly role: MailboxRole;
}

export interface OriginChanges {
  readonly kind: MoveOriginKind;
  readonly remember: readonly MoveOriginWork[];
  readonly forget: readonly MessageId[];
}

export interface StateMovePlan {
  readonly state: ThreadState;
  readonly moves: readonly PlannedMove[];
  readonly origins: OriginChanges | null;
}

export type StateMovePlanner = (
  messages: readonly LocatedMessage[],
  thread: ThreadSummary,
  copies: MailCopies,
) => StateMovePlan;

export const inRoles = (messages: readonly LocatedMessage[], roles: readonly MailboxRole[]) =>
  messages.filter(({ role }) => role !== undefined && roles.includes(role));

export const plan = (state: ThreadState, moves: readonly PlannedMove[] = []): StateMovePlan => ({
  state,
  moves,
  origins: null,
});

export const moveTo = (state: ThreadState, sources: readonly LocatedMessage[], role: MailboxRole) =>
  plan(
    state,
    sources.map(({ message }) => ({ messageId: message.id, role })),
  );

export const originsOf = (sources: readonly LocatedMessage[]): MoveOriginWork[] =>
  sources.flatMap(({ message, role }) =>
    role === undefined ? [] : [{ messageId: message.id, role }],
  );

export const returnTo = (
  origin: MailboxRole | undefined,
  targets: readonly MailboxRole[],
): MailboxRole => (origin !== undefined && targets.includes(origin) ? origin : 'inbox');

export const settledState = (roles: readonly (MailboxRole | undefined)[]): ThreadState => {
  if (roles.includes('inbox')) {
    return 'inbox';
  }
  if (roles.includes('archive')) {
    return 'done';
  }
  if (roles.includes('spam')) {
    return 'spam';
  }
  if (roles.includes('sent')) {
    return 'done';
  }
  return 'inbox';
};
