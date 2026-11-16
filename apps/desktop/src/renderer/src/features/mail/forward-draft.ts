import type { Address, Message, MessageId, ThreadDetail } from '@relay/shared';
import type { ComposeInit } from '../../state/ui-store';

const DATE_FORMAT = new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'short' });

const describe = (address: Address): string =>
  address.name === null ? address.email : `${address.name} <${address.email}>`;

const list = (addresses: readonly Address[]): string => addresses.map(describe).join(', ');

export const forwardSubject = (subject: string): string =>
  /^\s*(fwd?|fw):/i.test(subject) ? subject : `Fwd: ${subject}`;

export const forwardBody = (message: Message): string =>
  [
    '',
    '',
    '---------- Preposlaná správa ----------',
    `Od: ${message.from === null ? '' : describe(message.from)}`,
    `Dátum: ${DATE_FORMAT.format(new Date(message.date))}`,
    `Predmet: ${message.subject}`,
    `Komu: ${list(message.to)}`,
    ...(message.cc.length === 0 ? [] : [`Kópia: ${list(message.cc)}`]),
    '',
    message.textBody ?? message.snippet,
  ].join('\n');

const fileCount = (message: Message): number =>
  message.attachments.filter((attachment) => !attachment.inline).length;

export const forwardTarget = (
  messages: readonly Message[],
  messageId?: MessageId,
): Message | undefined => {
  if (messageId !== undefined) {
    return messages.find((message) => message.id === messageId);
  }
  const latest = messages.at(-1);
  if (latest === undefined || fileCount(latest) > 0) {
    return latest;
  }
  return messages.findLast((message) => fileCount(message) > 0) ?? latest;
};

export const forwardInit = (detail: ThreadDetail, messageId?: MessageId): ComposeInit | null => {
  const message = forwardTarget(detail.messages, messageId);
  if (message === undefined) {
    return null;
  }
  return {
    accountId: detail.thread.accountId,
    to: [],
    subject: forwardSubject(detail.thread.subject),
    body: forwardBody(message),
    forward: {
      messageId: message.id,
      attachmentCount: fileCount(message),
    },
  };
};
