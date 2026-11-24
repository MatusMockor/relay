import {
  type MailboxId,
  type MailboxRole,
  type MailboxRoleOf,
  type Message,
  type MessageId,
  type MessagePlacement,
  rankedPlacements,
} from '@relay/shared/domain';
import type { HeldOriginWork } from '../../../model/pending-work';
import type { MailboxRepository } from '../../../ports/mailbox-repository';
import type { PendingWorkRepository } from '../../../ports/pending-work-repository';
import { type MoveOrigin, moveOrigins } from '../../shared/move-origins';
import { roleMapLookup } from '../../shared/mailbox-role-of';
import { PendingMoves } from '../../shared/pending-moves';
import type { ThreadActionContext } from '../thread-action-context';
import type { LocatedMessage } from './state-move-plan';

type LiveMailboxes = ReadonlyMap<MailboxId, MailboxRole>;

const liveOrigin = (origin: MoveOrigin | undefined, mailboxes: LiveMailboxes) =>
  origin?.mailboxId === undefined || mailboxes.has(origin.mailboxId) ? origin : undefined;

const liveMoveOrigin = (origin: MoveOrigin | undefined, mailboxes: LiveMailboxes) => {
  if (origin === undefined || liveOrigin(origin, mailboxes) !== undefined) {
    return origin;
  }
  return origin.labelId === undefined
    ? { role: 'inbox' as const }
    : { role: 'inbox' as const, labelId: origin.labelId };
};

const HELD_KINDS = ['trash-origin', 'spam-origin'] as const;

const heldOriginsOf = (
  messageId: MessageId,
  origins: Readonly<Record<(typeof HELD_KINDS)[number], ReadonlyMap<MessageId, MoveOrigin>>>,
  mailboxes: LiveMailboxes,
): HeldOriginWork[] =>
  HELD_KINDS.flatMap((kind) => {
    const origin = liveOrigin(origins[kind].get(messageId), mailboxes);
    if (origin === undefined) {
      return [];
    }
    return [
      origin.mailboxId === undefined
        ? { kind, role: origin.role }
        : { kind, role: origin.role, mailboxId: origin.mailboxId },
    ];
  });

interface LocatorState {
  readonly roles: LiveMailboxes;
  readonly roleOf: MailboxRoleOf;
  readonly pending: PendingMoves;
  readonly trashed: ReadonlyMap<MessageId, MoveOrigin>;
  readonly reported: ReadonlyMap<MessageId, MoveOrigin>;
  readonly moved: ReadonlyMap<MessageId, MoveOrigin>;
}

const locatedAt = (
  state: LocatorState,
  message: Message,
  placement: MessagePlacement,
): LocatedMessage => {
  const { roles, trashed, reported } = state;
  const target = state.pending.targetOf(message, placement, state.roleOf);
  const role = target?.role ?? roles.get(placement.mailboxId);
  const mailboxId = target === undefined ? placement.mailboxId : target.mailboxId;
  const origins = role === 'spam' ? reported : trashed;
  return {
    message,
    placement,
    role,
    mailboxId,
    origin: liveOrigin(origins.get(message.id), roles),
    moveOrigin: liveMoveOrigin(state.moved.get(message.id), roles),
    heldOrigins: heldOriginsOf(
      message.id,
      { 'trash-origin': trashed, 'spam-origin': reported },
      roles,
    ),
    moving: target !== undefined,
  };
};

export class MessageLocator {
  constructor(
    private readonly mailboxes: MailboxRepository,
    private readonly pendingWork: PendingWorkRepository,
  ) {}

  async locate(context: ThreadActionContext): Promise<LocatedMessage[]> {
    const accountId = context.account.id;
    const { pendingWork } = this;
    const mailboxes = await this.mailboxes.listForSync(accountId);
    const roles = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox.role]));
    const state: LocatorState = {
      roles,
      roleOf: roleMapLookup(roles),
      pending: await PendingMoves.load(pendingWork, accountId),
      trashed: await moveOrigins(pendingWork, accountId, 'trash-origin'),
      reported: await moveOrigins(pendingWork, accountId, 'spam-origin'),
      moved: await moveOrigins(pendingWork, accountId, 'move-origin'),
    };
    return context.messages.flatMap((message) =>
      rankedPlacements(message, state.roleOf).map((placement) =>
        locatedAt(state, message, placement),
      ),
    );
  }
}
