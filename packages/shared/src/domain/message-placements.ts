import type { MailboxId } from './ids';
import type { MailboxRole } from './mailbox';
import type { Message, MessagePlacement } from './message';

export const PENDING_UID = 0;

export const PLACEMENT_ROLE_ORDER: readonly MailboxRole[] = [
  'inbox',
  'archive',
  'label',
  'custom',
  'sent',
  'spam',
  'trash',
];

export type MailboxRoleOf = (mailboxId: MailboxId) => MailboxRole | undefined;

type Placed = Pick<Message, 'placements' | 'mailboxId' | 'uid'>;

const PENDING_OFFSET = PLACEMENT_ROLE_ORDER.length + 1;

const placementsOf = (message: Placed): readonly MessagePlacement[] =>
  message.placements.length > 0
    ? message.placements
    : [{ mailboxId: message.mailboxId, uid: message.uid }];

const roleRank = (role: MailboxRole | undefined): number => {
  const index = role === undefined ? -1 : PLACEMENT_ROLE_ORDER.indexOf(role);
  return index === -1 ? PLACEMENT_ROLE_ORDER.length : index;
};

export const isPendingPlacement = (placement: MessagePlacement): boolean =>
  placement.uid === PENDING_UID;

export const placementRank = (placement: MessagePlacement, roleOf: MailboxRoleOf): number =>
  (isPendingPlacement(placement) ? PENDING_OFFSET : 0) + roleRank(roleOf(placement.mailboxId));

const byMailboxId = (a: MessagePlacement, b: MessagePlacement): number => {
  if (a.mailboxId === b.mailboxId) {
    return 0;
  }
  return a.mailboxId < b.mailboxId ? -1 : 1;
};

export const rankedPlacements = (message: Placed, roleOf: MailboxRoleOf): MessagePlacement[] =>
  [...placementsOf(message)].sort(
    (a, b) => placementRank(a, roleOf) - placementRank(b, roleOf) || byMailboxId(a, b),
  );

export const primaryPlacement = (message: Placed, roleOf: MailboxRoleOf): MessagePlacement =>
  rankedPlacements(message, roleOf)[0] ?? { mailboxId: message.mailboxId, uid: message.uid };

export const placementIn = (message: Placed, mailboxId: MailboxId): MessagePlacement | undefined =>
  placementsOf(message).find((placement) => placement.mailboxId === mailboxId);

export const isPlacedIn = (message: Placed, mailboxId: MailboxId): boolean =>
  placementIn(message, mailboxId) !== undefined;
