import {
  type HeldThreadState,
  isHeldThreadState,
  type MailboxId,
  type MailboxRole,
  type Message,
  type MessageId,
  type ThreadState,
  type ThreadSummary,
} from '@relay/shared/domain';
import type { ThreadRefreshWork } from '../../model/pending-work';
import type { MailCopies } from '../shared/mail-copies';
import { isHeldRole } from './held-roles';

export type MessageRoleOf = (message: Message) => MailboxRole | undefined;

type Roles = readonly (MailboxRole | undefined)[];

const RESTORE_ROLES: readonly MailboxRole[] = ['inbox', 'archive'];

export const messageRoleOf =
  (
    mailboxRoles: ReadonlyMap<MailboxId, MailboxRole>,
    pendingMoves: ReadonlyMap<MessageId, MailboxRole>,
  ): MessageRoleOf =>
  (message) =>
    pendingMoves.get(message.id) ?? mailboxRoles.get(message.mailboxId);

const heldPlacement = (roles: Roles): HeldThreadState | undefined => {
  const placed = roles.filter((role) => role !== 'sent');
  if (placed.length === 0 || !placed.every((role) => role !== undefined && isHeldRole(role))) {
    return undefined;
  }
  return placed.every((role) => role === 'trash') ? 'trash' : 'spam';
};

const reappeared = (work: ThreadRefreshWork, roles: Roles): boolean =>
  work.arrivedIn.some((role) => RESTORE_ROLES.includes(role)) &&
  roles.some((role) => role !== undefined && RESTORE_ROLES.includes(role));

const left = (work: ThreadRefreshWork, roles: Roles, held: HeldThreadState): boolean =>
  !roles.includes(held) || reappeared(work, roles);

export const syncedThreadState = (
  work: ThreadRefreshWork,
  existing: ThreadSummary | null,
  messages: readonly Message[],
  roleOf: MessageRoleOf,
  copies: MailCopies,
): ThreadState => {
  const roles = messages.map(roleOf);
  const placed = copies.filedRoles(messages.map((message) => ({ message, role: roleOf(message) })));
  const inInbox = roles.includes('inbox');
  if (work.arrivedIn.includes('inbox') && inInbox) {
    return 'inbox';
  }
  const onlyHeld = heldPlacement(placed);
  if (onlyHeld !== undefined) {
    return onlyHeld;
  }
  if (existing === null) {
    return 'done';
  }
  if (isHeldThreadState(existing.state) && left(work, placed, existing.state)) {
    return inInbox ? 'inbox' : 'done';
  }
  if (work.expungedFromInbox && existing.state === 'inbox' && !inInbox) {
    return 'done';
  }
  return existing.state;
};
