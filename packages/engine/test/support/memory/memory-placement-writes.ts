import {
  type Message,
  type MessageId,
  type MessagePlacement,
  PENDING_UID,
  placementIn,
} from '@relay/shared/domain';
import type { PlacementMove } from '../../../src';
import type { MemoryDatabase } from './memory-database';
import { isPlacedAt, withPlacement, withPlacements } from './memory-placements';

export const placementConflict = (): Error =>
  new Error('Unique constraint failed: message_placements (mailbox_id, uid)');

export const isOccupied = (
  db: MemoryDatabase,
  location: MessagePlacement,
  owner: MessageId,
): boolean =>
  location.uid !== PENDING_UID &&
  [...db.tables.messages.values()].some(
    (message) => message.id !== owner && isPlacedAt(message, location),
  );

export const storePlacements = (
  db: MemoryDatabase,
  message: Message,
  placements: readonly MessagePlacement[],
): Message => {
  const stored = withPlacements(db, message, placements);
  db.tables.messages.set(message.id, stored);
  return stored;
};

export const movePlacementOf = (
  db: MemoryDatabase,
  messageId: MessageId,
  move: PlacementMove,
): Promise<void> => {
  const message = db.tables.messages.get(messageId);
  if (message === undefined) {
    return Promise.resolve();
  }
  if (isOccupied(db, move.to, messageId)) {
    return Promise.reject(placementConflict());
  }
  const known = placementIn(message, move.to.mailboxId)?.uid ?? PENDING_UID;
  const uid = move.to.uid === PENDING_UID ? known : move.to.uid;
  const dropsSource = !move.keepSource && move.from !== move.to.mailboxId;
  const kept = dropsSource
    ? message.placements.filter((placement) => placement.mailboxId !== move.from)
    : message.placements;
  storePlacements(db, message, withPlacement(kept, { mailboxId: move.to.mailboxId, uid }));
  return Promise.resolve();
};
