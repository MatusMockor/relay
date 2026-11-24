import type { Message } from '@relay/shared';

export type ReceivedMessage = Message & { readonly from: NonNullable<Message['from']> };

const isReceived = (message: Message, own: ReadonlySet<string>): message is ReceivedMessage =>
  message.from !== null && !own.has(message.from.email.toLowerCase());

export const latestReceived = (
  messages: readonly Message[],
  ownEmails: readonly string[],
): ReceivedMessage | null => {
  const own = new Set(ownEmails.map((email) => email.toLowerCase()));
  return messages
    .filter((message): message is ReceivedMessage => isReceived(message, own))
    .reduce<ReceivedMessage | null>(
      (latest, message) =>
        latest === null || Date.parse(message.date) >= Date.parse(latest.date) ? message : latest,
      null,
    );
};
