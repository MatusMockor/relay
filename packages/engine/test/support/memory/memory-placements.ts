import {
  type MailboxId,
  type MailboxRoleOf,
  type Message,
  type MessagePlacement,
  primaryPlacement,
} from '@relay/shared/domain';
import type { MessageLocation } from '../../../src';
import type { MemoryDatabase } from './memory-database';

export const placedAt = (message: Message, location: MessageLocation): Message => ({
  ...message,
  mailboxId: location.mailboxId,
  uid: location.uid,
  placements: [{ mailboxId: location.mailboxId, uid: location.uid }],
});

export const placedIn = (message: Message, mailboxId: MailboxId): MessagePlacement[] =>
  message.placements.filter((placement) => placement.mailboxId === mailboxId);

export const isPlacedAt = (message: Message, location: MessageLocation): boolean =>
  placedIn(message, location.mailboxId).some((placement) => placement.uid === location.uid);

export const isPlacedInAny = (message: Message, mailboxIds: ReadonlySet<MailboxId>): boolean =>
  message.placements.some((placement) => mailboxIds.has(placement.mailboxId));

export const roleOfIn =
  (db: MemoryDatabase): MailboxRoleOf =>
  (mailboxId) =>
    db.tables.mailboxes.get(mailboxId)?.role;

const byMailboxId = (a: MessagePlacement, b: MessagePlacement): number => {
  if (a.mailboxId === b.mailboxId) {
    return 0;
  }
  return a.mailboxId < b.mailboxId ? -1 : 1;
};

export const withPlacements = (
  db: MemoryDatabase,
  message: Message,
  placements: readonly MessagePlacement[],
): Message => {
  const sorted = [...placements].sort(byMailboxId);
  const primary = primaryPlacement({ ...message, placements: sorted }, roleOfIn(db));
  return { ...message, placements: sorted, mailboxId: primary.mailboxId, uid: primary.uid };
};

export const withPlacement = (
  placements: readonly MessagePlacement[],
  placement: MessagePlacement,
): MessagePlacement[] => [
  ...placements.filter((existing) => existing.mailboxId !== placement.mailboxId),
  placement,
];
