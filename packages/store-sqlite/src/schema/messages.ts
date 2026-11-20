import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { mailboxes } from './mailboxes';

export const messages = sqliteTable(
  'messages',
  {
    seq: integer('seq').primaryKey(),
    id: text('id').notNull().unique(),
    userId: text('user_id').notNull(),
    threadId: text('thread_id').notNull(),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    mailboxId: text('mailbox_id')
      .notNull()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    uid: integer('uid').notNull(),
    messageIdHeader: text('message_id_header'),
    emailId: text('email_id'),
    inReplyTo: text('in_reply_to'),
    references: text('references', { mode: 'json' }).notNull(),
    fromName: text('from_name'),
    fromEmail: text('from_email'),
    to: text('to', { mode: 'json' }).notNull(),
    cc: text('cc', { mode: 'json' }).notNull(),
    bcc: text('bcc', { mode: 'json' }).notNull(),
    replyTo: text('reply_to', { mode: 'json' }).notNull(),
    subject: text('subject').notNull(),
    normalizedSubject: text('normalized_subject'),
    date: text('date').notNull(),
    dateTs: integer('date_ts').notNull(),
    snippet: text('snippet').notNull(),
    textBody: text('text_body'),
    htmlBody: text('html_body'),
    seen: integer('seen', { mode: 'boolean' }).notNull(),
    flagged: integer('flagged', { mode: 'boolean' }).notNull(),
    answered: integer('answered', { mode: 'boolean' }).notNull(),
    attachments: text('attachments', { mode: 'json' }).notNull(),
    headers: text('headers', { mode: 'json' }).notNull(),
  },
  (table) => [
    uniqueIndex('messages_mailbox_uid_unique').on(table.mailboxId, table.uid),
    index('messages_thread_date_idx').on(table.threadId, table.dateTs),
    index('messages_mailbox_thread_idx').on(table.mailboxId, table.threadId),
    index('messages_account_header_idx').on(table.accountId, table.messageIdHeader),
    index('messages_account_email_idx').on(table.accountId, table.emailId),
    index('messages_user_idx').on(table.userId),
    index('messages_account_subject_idx').on(
      table.accountId,
      table.normalizedSubject,
      table.dateTs,
    ),
  ],
);

export type MessageRow = typeof messages.$inferSelect;
