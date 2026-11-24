import {
  isPlacedIn,
  type MailboxId,
  type MailboxRoleOf,
  type Message,
  type MessagePlacement,
  primaryPlacement,
} from '@relay/shared';
import type { DemoState } from './demo-state';

export const demoRoleOf =
  (state: DemoState): MailboxRoleOf =>
  (mailboxId) =>
    state.mailboxes.find((mailbox) => mailbox.id === mailboxId)?.role;

const withPlacements = (
  message: Message,
  placements: MessagePlacement[],
  roleOf: MailboxRoleOf,
): Message => {
  const primary = primaryPlacement({ ...message, placements }, roleOf);
  return { ...message, mailboxId: primary.mailboxId, uid: primary.uid, placements };
};

const movedPlacement = (
  message: Message,
  placement: MessagePlacement,
  from: MailboxId,
  to: MailboxId,
): MessagePlacement[] => {
  if (placement.mailboxId !== from) {
    return [placement];
  }
  return isPlacedIn(message, to) ? [] : [{ ...placement, mailboxId: to }];
};

export const withPlacementMoved = (
  message: Message,
  from: MailboxId,
  to: MailboxId,
  roleOf: MailboxRoleOf,
): Message =>
  withPlacements(
    message,
    message.placements.flatMap((placement) => movedPlacement(message, placement, from, to)),
    roleOf,
  );

export const withSinglePlacement = (
  message: Message,
  mailboxId: MailboxId,
  roleOf: MailboxRoleOf,
): Message => {
  const { uid } = primaryPlacement(message, roleOf);
  return withPlacements(message, [{ mailboxId, uid }], roleOf);
};

export const withPlacementsOf = (message: Message, before: Message): Message => ({
  ...message,
  mailboxId: before.mailboxId,
  uid: before.uid,
  placements: before.placements,
});

export const placementSetOf = (message: Message): string =>
  message.placements
    .map((placement) => placement.mailboxId)
    .sort()
    .join(',');
