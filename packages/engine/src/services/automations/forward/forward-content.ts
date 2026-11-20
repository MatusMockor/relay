import type { Address, DraftContent, EmailAddress, Message } from '@relay/shared/domain';

const DATE_FORMAT = new Intl.DateTimeFormat('sk-SK', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

const describe = (address: Address): string =>
  address.name === null ? address.email : `${address.name} <${address.email}>`;

const list = (addresses: readonly Address[]): string => addresses.map(describe).join(', ');

export const forwardSubject = (subject: string): string =>
  /^\s*(fwd?|fw):/i.test(subject) ? subject : `Fwd: ${subject}`;

export const forwardBody = (message: Message, text: string | null): string =>
  [
    '---------- Preposlaná správa ----------',
    `Od: ${message.from === null ? '' : describe(message.from)}`,
    `Dátum: ${DATE_FORMAT.format(new Date(message.date))} UTC`,
    `Predmet: ${message.subject}`,
    `Komu: ${list(message.to)}`,
    ...(message.cc.length === 0 ? [] : [`Kópia: ${list(message.cc)}`]),
    '',
    text ?? message.snippet,
  ].join('\n');

export const forwardDraftOf = (
  message: Message,
  to: EmailAddress,
  text: string | null,
): DraftContent => ({
  accountId: message.accountId,
  to: [{ name: null, email: to }],
  cc: [],
  bcc: [],
  subject: forwardSubject(message.subject),
  body: forwardBody(message, text),
  inReplyToThreadId: null,
  inReplyToMessageId: null,
  attachments: [],
});
