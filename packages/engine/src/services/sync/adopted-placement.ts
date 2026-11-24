import type { Message } from '@relay/shared/domain';
import type { MessageLocation } from '../../ports/message-repository';

export const withAdoptedPlacement = (
  message: Message,
  location: MessageLocation | null,
): Message => {
  if (location === null) {
    return message;
  }
  const adopted = message.placements.some(({ mailboxId }) => mailboxId === location.mailboxId);
  if (!adopted) {
    return { ...message, ...location, placements: [location] };
  }
  const placements = message.placements.map((placement) =>
    placement.mailboxId === location.mailboxId ? location : placement,
  );
  const mirror = message.mailboxId === location.mailboxId ? location : {};
  return { ...message, ...mirror, placements };
};
