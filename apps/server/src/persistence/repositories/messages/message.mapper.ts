import { normalizeSubject } from '@relay/engine';
import type { LabelId, Message, UserId } from '@relay/shared/domain';
import type { messages } from '../../schema';
import { toDate, toIso } from '../../support/timestamps';

type MessageRow = Omit<typeof messages.$inferSelect, 'searchVector'> & {
  readonly labelIds: LabelId[];
};
type MessageInsert = typeof messages.$inferInsert;

export const toMessage = (row: MessageRow): Message => ({
  id: row.id,
  threadId: row.threadId,
  accountId: row.accountId,
  mailboxId: row.mailboxId,
  uid: row.uid,
  messageIdHeader: row.messageIdHeader,
  emailId: row.emailId,
  inReplyTo: row.inReplyTo,
  references: row.references,
  from: row.from,
  to: row.to,
  cc: row.cc,
  bcc: row.bcc,
  replyTo: row.replyTo,
  subject: row.subject,
  date: toIso(row.date),
  snippet: row.snippet,
  textBody: row.textBody,
  htmlBody: row.htmlBody,
  flags: { seen: row.seen, flagged: row.flagged, answered: row.answered },
  labelIds: row.labelIds,
  attachments: row.attachments,
});

export const toMessageInsert = (
  userId: UserId,
  message: Message,
  headers: MessageInsert['headers'],
): MessageInsert => ({
  id: message.id,
  userId,
  accountId: message.accountId,
  mailboxId: message.mailboxId,
  threadId: message.threadId,
  uid: message.uid,
  messageIdHeader: message.messageIdHeader,
  emailId: message.emailId,
  inReplyTo: message.inReplyTo,
  references: message.references,
  from: message.from,
  to: message.to,
  cc: message.cc,
  bcc: message.bcc,
  replyTo: message.replyTo,
  subject: message.subject,
  normalizedSubject: normalizeSubject(message.subject).value,
  date: toDate(message.date),
  snippet: message.snippet,
  textBody: message.textBody,
  htmlBody: message.htmlBody,
  seen: message.flags.seen,
  flagged: message.flags.flagged,
  answered: message.flags.answered,
  attachments: message.attachments,
  headers,
});
