import type { MailboxRole } from '@relay/shared/domain';
import type { MailCopies } from '../../shared/mail-copies';
import { PENDING_UID } from '../../shared/pending-uid';
import { inRoles, type LocatedMessage, type PlannedMove } from './state-move-plan';

type Role = MailboxRole | undefined;

const RANK: readonly MailboxRole[] = ['trash', 'spam', 'inbox', 'archive', 'custom', 'sent'];

const rankOf = (role: Role): number => {
  const index = role === undefined ? -1 : RANK.indexOf(role);
  return index === -1 ? RANK.length : index;
};

const pending = (located: LocatedMessage): boolean => located.message.uid === PENDING_UID;

const preferred = (candidate: LocatedMessage, current: LocatedMessage): boolean => {
  if (candidate.moving !== current.moving) {
    return candidate.moving;
  }
  if (pending(candidate) !== pending(current)) {
    return pending(current);
  }
  return rankOf(candidate.role) < rankOf(current.role);
};

const merged = (current: LocatedMessage, candidate: LocatedMessage): LocatedMessage => {
  const [best, other] = preferred(candidate, current) ? [candidate, current] : [current, candidate];
  return { ...best, origin: best.origin ?? other.origin };
};

export const onePerMessage = (
  copies: MailCopies,
  messages: readonly LocatedMessage[],
): LocatedMessage[] => {
  const chosen = new Map<string, LocatedMessage>();
  for (const located of messages) {
    const key = copies.identityOf(located.message);
    const current = chosen.get(key);
    chosen.set(key, current === undefined ? located : merged(current, located));
  }
  return [...chosen.values()];
};

export const copiesIn = (
  copies: MailCopies,
  messages: readonly LocatedMessage[],
  roles: readonly MailboxRole[],
) => onePerMessage(copies, inRoles(messages, roles));

export const receivedIn = (
  copies: MailCopies,
  messages: readonly LocatedMessage[],
  roles: readonly MailboxRole[],
) => {
  const filed = copies.filedSentCopies(messages);
  return copiesIn(
    copies,
    messages.filter(({ message }) => !filed.has(message.id)),
    roles,
  );
};

interface Placement {
  readonly moved: boolean;
  readonly role: Role;
}

const better = (candidate: Placement, current: Placement): boolean =>
  candidate.moved !== current.moved
    ? candidate.moved
    : rankOf(candidate.role) < rankOf(current.role);

export const rolesAfter = (
  copies: MailCopies,
  messages: readonly LocatedMessage[],
  moves: readonly PlannedMove[],
): Role[] => {
  const targets = new Map(moves.map((move) => [move.messageId, move.role]));
  const placed = messages.map(({ message, role }) => ({
    message,
    role: targets.get(message.id) ?? role,
  }));
  const roles = copies.filedRoles(placed);
  const byMessage = new Map<string, Placement>();
  placed.forEach(({ message }, index) => {
    const placement = { moved: targets.has(message.id), role: roles[index] };
    const key = copies.identityOf(message);
    const current = byMessage.get(key);
    if (current === undefined || better(placement, current)) {
      byMessage.set(key, placement);
    }
  });
  return [...byMessage.values()].map((placement) => placement.role);
};
