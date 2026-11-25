import {
  isPendingPlacement,
  type MailboxRole,
  type Message,
  type MessageId,
} from '@relay/shared/domain';
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
    const key = copies.logicalKeyOf(located.message);
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

interface PlacedRow {
  readonly message: Message;
  readonly moved: boolean;
  readonly roles: readonly Role[];
}

const bestRank = (row: PlacedRow): number => Math.min(...row.roles.map(rankOf));

const better = (candidate: PlacedRow, current: PlacedRow): boolean =>
  candidate.moved !== current.moved ? candidate.moved : bestRank(candidate) < bestRank(current);

const rowsOf = (
  placed: readonly { readonly message: Message; readonly moved: boolean }[],
  roles: readonly Role[],
): PlacedRow[] => {
  const rows = new Map<MessageId, PlacedRow>();
  placed.forEach(({ message, moved }, index) => {
    const row = rows.get(message.id) ?? { message, moved: false, roles: [] };
    rows.set(message.id, {
      message,
      moved: row.moved || moved,
      roles: [...row.roles, roles[index]],
    });
  });
  return [...rows.values()];
};

export const rolesAfter = (
  copies: MailCopies,
  messages: readonly LocatedMessage[],
  moves: readonly PlannedMove[],
): Role[] => {
  const targets = new Map(
    moves.map((move) => [placementKey(move.messageId, move.source.mailboxId), move.role]),
  );
  const placed = messages.map(({ message, placement, role }) => {
    const target = targets.get(placementKey(message.id, placement.mailboxId));
    return { message, placement, role: target ?? role, moved: target !== undefined };
  });
  const byKey = new Map<string, PlacedRow>();
  for (const row of rowsOf(placed, copies.filedRoles(placed))) {
    const key = copies.logicalKeyOf(row.message);
    const current = byKey.get(key);
    if (current === undefined || better(row, current)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()].flatMap((row) => row.roles);
};
