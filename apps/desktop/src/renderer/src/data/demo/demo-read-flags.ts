import type { Message, ThreadAction } from '@relay/shared';

const withSeen = (message: Message, seen: boolean): Message => ({
  ...message,
  flags: { ...message.flags, seen },
});

const latestOf = (messages: readonly Message[]): Message | undefined =>
  [...messages].sort((left, right) => left.date.localeCompare(right.date)).at(-1);

export const applyReadFlags = (messages: Message[], action: ThreadAction): Message[] => {
  if (action.type === 'markRead') {
    return messages.map((message) => withSeen(message, true));
  }
  if (action.type !== 'markUnread') {
    return messages;
  }
  const latest = latestOf(messages);
  return messages.map((message) => (message === latest ? withSeen(message, false) : message));
};
