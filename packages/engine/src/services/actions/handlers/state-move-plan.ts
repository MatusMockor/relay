import {
  isPendingPlacement,
  type LabelId,
  type MailboxId,
  type MailboxRole,
  type Message,
  type MessageId,
  type MessagePlacement,
  type ThreadState,
  type ThreadSummary,
} from '@relay/shared/domain';
import type { HeldOriginWork, MoveOriginWork } from '../../../model/pending-work';
import type { MailCopies } from '../../shared/mail-copies';
import type { MoveOrigin, MoveOriginKind } from '../../shared/move-origins';

export type StateMoveAction =
  | 'done'
  | 'archive'
  | 'undone'
  | 'trash'
  | 'restore'
  | 'reportSpam'
  | 'notSpam';

export interface LocatedMessage {
  readonly message: Message;
  readonly placement: MessagePlacement;
  readonly role: MailboxRole | undefined;
  readonly mailboxId: MailboxId | undefined;
  readonly origin: MoveOrigin | undefined;
  readonly moveOrigin?: MoveOrigin;
  readonly heldOrigins?: readonly HeldOriginWork[];
  readonly moving: boolean;
}

export interface MoveTarget {
  readonly role: MailboxRole;
  readonly mailboxId?: MailboxId;
}

export interface PlannedMove extends MoveTarget {
  readonly messageId: MessageId;
  readonly source: MessagePlacement;
}

export interface OriginChanges {
  readonly kind: MoveOriginKind;
  readonly remember: readonly MoveOriginWork[];
  readonly forget: readonly MessageId[];
}

export interface LabelChange {
  readonly labelId: LabelId;
  readonly value: boolean;
  readonly messageIds: readonly MessageId[];
  readonly providerMessageIds: readonly MessageId[];
}

export interface StateMovePlan {
  readonly state: ThreadState;
  readonly markedDone?: boolean;
  readonly moves: readonly PlannedMove[];
  readonly origins: readonly OriginChanges[];
  readonly labels: readonly LabelChange[];
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
  origins: [],
  labels: [],
});

export const moveTo = (state: ThreadState, sources: readonly LocatedMessage[], role: MailboxRole) =>
  plan(
    state,
    sources.map(({ message, placement }) => ({ messageId: message.id, source: placement, role })),
  );

export const sourceUidOf = (located: LocatedMessage): { readonly uid?: number } =>
  located.moving || isPendingPlacement(located.placement) ? {} : { uid: located.placement.uid };

const originOf = (source: LocatedMessage, role: MailboxRole): MoveOriginWork => {
  const { message, mailboxId } = source;
  if (role !== 'custom' || mailboxId === undefined) {
    return { messageId: message.id, role, ...sourceUidOf(source) };
  }
  return { messageId: message.id, role, mailboxId, ...sourceUidOf(source) };
};

export const originsOf = (sources: readonly LocatedMessage[]): MoveOriginWork[] =>
  sources.flatMap((source) => (source.role === undefined ? [] : [originOf(source, source.role)]));

const INBOX: MoveTarget = { role: 'inbox' };

export const returnTo = (
  origin: MoveOrigin | undefined,
  targets: readonly MailboxRole[],
): MoveTarget => {
  if (origin === undefined || !targets.includes(origin.role)) {
    return INBOX;
  }
  if (origin.role !== 'custom') {
    return { role: origin.role };
  }
  return origin.mailboxId === undefined ? INBOX : { role: 'custom', mailboxId: origin.mailboxId };
};

export const settledState = (roles: readonly (MailboxRole | undefined)[]): ThreadState => {
  if (roles.includes('inbox')) {
    return 'inbox';
  }
  if (roles.includes('archive') || roles.includes('custom')) {
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
