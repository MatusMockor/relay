import type { Message, UnsubscribeOptions } from '@relay/shared';
import type { ReceivedMessage } from './latest-received';

const offersLink = (options: UnsubscribeOptions | undefined): boolean =>
  options !== undefined && (options.url !== null || options.mailto !== null);

export const isNewsletterSource = (
  source: ReceivedMessage,
  messages: readonly Message[],
  ownEmails: readonly string[],
  options: UnsubscribeOptions | undefined,
): boolean => {
  const own = new Set(ownEmails.map((email) => email.toLowerCase()));
  const sender = source.from.email.toLowerCase();
  return (
    offersLink(options) &&
    messages.every((message) => {
      const from = message.from?.email.toLowerCase() ?? sender;
      return own.has(from) || from === sender;
    })
  );
};
