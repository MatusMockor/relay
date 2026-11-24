import {
  type MailboxId,
  type Message,
  type MessageId,
  type MessagePlacement,
  PENDING_UID,
  type ThreadId,
} from '@relay/shared/domain';
import type { MemoryDatabase } from './memory-database';
import { storePlacements } from './memory-placement-writes';

type PlacementFilter = (message: Message, placement: MessagePlacement) => boolean;

const deleteMessage = (db: MemoryDatabase, messageId: MessageId): void => {
  const { tables } = db;
  tables.messages.delete(messageId);
  tables.messageHeaders.delete(messageId);
  tables.messageEffects.delete(messageId);
  [...tables.messageAliases.entries()]
    .filter(([, target]) => target === messageId)
    .forEach(([alias]) => tables.messageAliases.delete(alias));
};

const dropPlacements = (db: MemoryDatabase, drops: PlacementFilter): ThreadId[] => {
  const threadIds = new Set<ThreadId>();
  [...db.tables.messages.values()].forEach((message) => {
    const kept = message.placements.filter((placement) => !drops(message, placement));
    if (kept.length === message.placements.length) {
      return;
    }
    threadIds.add(message.threadId);
    if (kept.length === 0) {
      deleteMessage(db, message.id);
      return;
    }
    storePlacements(db, message, kept);
  });
  return [...threadIds].sort();
};

export const deleteAtUids = (
  db: MemoryDatabase,
  mailboxId: MailboxId,
  uids: readonly number[],
): ThreadId[] => {
  const targets = new Set(uids.filter((uid) => uid > PENDING_UID));
  return dropPlacements(
    db,
    (_, placement) => placement.mailboxId === mailboxId && targets.has(placement.uid),
  );
};

export const removePlacementOf = (
  db: MemoryDatabase,
  messageId: MessageId,
  mailboxId: MailboxId,
): ThreadId[] =>
  dropPlacements(
    db,
    (message, placement) => message.id === messageId && placement.mailboxId === mailboxId,
  );

export const forgetMailboxPlacements = (db: MemoryDatabase, mailboxId: MailboxId): ThreadId[] =>
  dropPlacements(db, (_, placement) => placement.mailboxId === mailboxId);
