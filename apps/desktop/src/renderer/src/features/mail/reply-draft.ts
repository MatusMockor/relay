import type { Address, DraftContent, MailAccount, ThreadDetail } from '@relay/shared';

export const replySubject = (subject: string): string =>
  /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;

export const replyRecipients = (detail: ThreadDetail, own: ReadonlySet<string>): Address[] => {
  const inbound = [...detail.messages]
    .reverse()
    .find((message) => message.from !== null && !own.has(message.from.email));
  if (inbound?.from !== null && inbound?.from !== undefined) {
    return [inbound.replyTo[0] ?? inbound.from];
  }
  const first = detail.thread.participants.find((address) => !own.has(address.email));
  return first === undefined ? [] : [first];
};

export const buildReplyDraft = (
  detail: ThreadDetail,
  text: string,
  account: MailAccount,
  accounts: readonly MailAccount[],
): DraftContent => {
  const own = new Set(accounts.map((item) => item.email));
  const last = detail.messages.at(-1);
  return {
    accountId: account.id,
    to: replyRecipients(detail, own),
    cc: [],
    bcc: [],
    subject: replySubject(detail.thread.subject),
    body: text.trim(),
    inReplyToThreadId: detail.thread.id,
    inReplyToMessageId: last?.id ?? null,
    attachments: [],
  };
};
