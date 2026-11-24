import type { MailboxId, Message, MessagePlacement } from '@relay/shared/domain';
import type { MessageLocation } from '../../../src';

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
