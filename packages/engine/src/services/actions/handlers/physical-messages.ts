import { isPendingPlacement, type MailboxRole, type Message } from '@relay/shared/domain';
import type { MailCopies } from '../../shared/mail-copies';
import { placementKey } from '../../shared/placement-key';
import { inRoles, type LocatedMessage, type PlannedMove } from './state-move-plan';

type Role = MailboxRole | undefined;

const RANK: readonly MailboxRole[] = ['trash', 'spam', 'inbox', 'archive', 'custom', 'sent'];

const rankOf = (role: Role): number => {
  const index = role === undefined ? -1 : RANK.indexOf(role);
  return index === -1 ? RANK.length : index;
};

const pending = (located: LocatedMessage): boolean => isPendingPlacement(located.placement);

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
    messages.filter(
      ({ message, placement }) => !filed.has(placementKey(message.id, placement.mailboxId)),
    ),
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
  keyOf: (message: Message) => string = (message) => copies.identityOf(message),
): Role[] => {
  const targets = new Map(
    moves.map((move) => [placementKey(move.messageId, move.source.mailboxId), move.role]),
  );
  const placed = messages.map(({ message, placement, role }) => {
    const target = targets.get(placementKey(message.id, placement.mailboxId));
    return { message, placement, role: target ?? role, moved: target !== undefined };
  });
  const roles = copies.filedRoles(placed);
  const byMessage = new Map<string, Placement>();
  placed.forEach(({ message, moved }, index) => {
    const placement = { moved, role: roles[index] };
    const key = keyOf(message);
    const current = byMessage.get(key);
    if (current === undefined || better(placement, current)) {
      byMessage.set(key, placement);
    }
  });
  return [...byMessage.values()].map((placement) => placement.role);
};
