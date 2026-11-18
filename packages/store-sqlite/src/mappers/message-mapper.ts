import { type MessageHeaders, normalizeSubject } from '@relay/engine';
import { type Message, MessageSchema, type UserId } from '@relay/shared/domain';
import { z } from 'zod';
import type { MessageRow, messages } from '../schema';
import { toTimestamp } from './timestamp';

const HeaderEntriesSchema = z.array(z.tuple([z.string(), z.array(z.string())]));

export const toMessageHeaders = (stored: unknown): MessageHeaders =>
  new Map(HeaderEntriesSchema.parse(stored));

export const toMessage = (row: MessageRow, labelIds: readonly string[]): Message =>
  MessageSchema.parse({
    id: row.id,
    threadId: row.threadId,
    accountId: row.accountId,
    mailboxId: row.mailboxId,
    uid: row.uid,
    messageIdHeader: row.messageIdHeader,
    emailId: row.emailId,
    inReplyTo: row.inReplyTo,
    references: row.references,
    from: row.fromEmail === null ? null : { name: row.fromName, email: row.fromEmail },
    to: row.to,
    cc: row.cc,
    bcc: row.bcc,
    replyTo: row.replyTo,
    subject: row.subject,
    date: row.date,
    snippet: row.snippet,
    textBody: row.textBody,
    htmlBody: row.htmlBody,
    flags: { seen: row.seen, flagged: row.flagged, answered: row.answered },
    labelIds,
    attachments: row.attachments,
  });

export const toMessageRow = (
  userId: UserId,
  message: Message,
  headers: MessageHeaders,
): Omit<typeof messages.$inferInsert, 'seq'> => ({
  id: message.id,
  userId,
  threadId: message.threadId,
  accountId: message.accountId,
  mailboxId: message.mailboxId,
  uid: message.uid,
  messageIdHeader: message.messageIdHeader,
  emailId: message.emailId,
  inReplyTo: message.inReplyTo,
  references: message.references,
  fromName: message.from?.name ?? null,
  fromEmail: message.from?.email ?? null,
  to: message.to,
  cc: message.cc,
  bcc: message.bcc,
  replyTo: message.replyTo,
  subject: message.subject,
  normalizedSubject: normalizeSubject(message.subject).value,
  date: message.date,
  dateTs: toTimestamp(message.date),
  snippet: message.snippet,
  textBody: message.textBody,
  htmlBody: message.htmlBody,
  seen: message.flags.seen,
  flagged: message.flags.flagged,
  answered: message.flags.answered,
  attachments: message.attachments,
  headers: [...headers.entries()],
});
