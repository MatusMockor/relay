import type { Message, MessageId } from '@relay/shared/domain';

interface Located {
  readonly message: Message;
}

export const firstPerMessage = <Entry extends Located>(located: readonly Entry[]): Entry[] => {
  const chosen = new Map<MessageId, Entry>();
  for (const entry of located) {
    if (!chosen.has(entry.message.id)) {
      chosen.set(entry.message.id, entry);
    }
  }
  return [...chosen.values()];
};

export const uniqueMessageIds = (located: readonly Located[]): MessageId[] =>
  firstPerMessage(located).map(({ message }) => message.id);

export const uniqueIds = (moves: readonly { readonly messageId: MessageId }[]): MessageId[] => [
  ...new Set(moves.map(({ messageId }) => messageId)),
];
