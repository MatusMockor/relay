import type {
  AccountId,
  Address,
  AttachmentMeta,
  MailboxId,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { type SQL, sql } from 'drizzle-orm';
import { bigint, boolean, index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { timestampTz, tsvector } from './columns';
import { mailboxes } from './mailboxes';
import { users } from './users';

export type StoredHeaders = Record<string, string[]>;

const searchDocument = (): SQL => sql`
  setweight(to_tsvector('simple', relay_search_text(coalesce(subject, ''))), 'A') ||
  setweight(to_tsvector('simple', relay_search_text(
    coalesce(from_address->>'name', '') || ' ' || coalesce(from_address->>'email', '') || ' ' ||
    jsonb_path_query_array(to_addresses, '$[*].name')::text || ' ' ||
    jsonb_path_query_array(to_addresses, '$[*].email')::text || ' ' ||
    jsonb_path_query_array(cc_addresses, '$[*].name')::text || ' ' ||
    jsonb_path_query_array(cc_addresses, '$[*].email')::text
  )), 'B') ||
  setweight(to_tsvector('simple', relay_search_text(left(coalesce(text_body, snippet), 200000))), 'D')`;

export const messages = pgTable(
  'messages',
  {
    id: text('id').$type<MessageId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    mailboxId: text('mailbox_id')
      .$type<MailboxId>()
      .notNull()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').$type<ThreadId>().notNull(),
    uid: bigint('uid', { mode: 'number' }).notNull(),
    messageIdHeader: text('message_id_header'),
    emailId: text('email_id'),
    inReplyTo: text('in_reply_to'),
    references: text('references').array().notNull(),
    from: jsonb('from_address').$type<Address>(),
    to: jsonb('to_addresses').$type<Address[]>().notNull(),
    cc: jsonb('cc_addresses').$type<Address[]>().notNull(),
    bcc: jsonb('bcc_addresses').$type<Address[]>().notNull(),
    replyTo: jsonb('reply_to_addresses').$type<Address[]>().notNull(),
    subject: text('subject').notNull(),
    normalizedSubject: text('normalized_subject'),
    date: timestampTz('date').notNull(),
    snippet: text('snippet').notNull(),
    textBody: text('text_body'),
    htmlBody: text('html_body'),
    seen: boolean('seen').notNull(),
    flagged: boolean('flagged').notNull(),
    answered: boolean('answered').notNull(),
    attachments: jsonb('attachments').$type<AttachmentMeta[]>().notNull(),
    headers: jsonb('headers').$type<StoredHeaders>().notNull(),
    searchVector: tsvector('search_vector').generatedAlwaysAs(searchDocument),
  },
  (table) => [
    uniqueIndex('messages_mailbox_uid_unique').on(table.mailboxId, table.uid),
    index('messages_thread_idx').on(table.threadId, table.date),
    index('messages_account_header_idx').on(table.accountId, table.messageIdHeader),
    index('messages_account_email_idx').on(table.accountId, table.emailId),
    index('messages_user_idx').on(table.userId),
    index('messages_search_idx').using('gin', table.searchVector),
    index('messages_account_subject_hash_idx').on(
      table.accountId,
      sql`md5(${table.normalizedSubject})`,
      table.date.desc(),
    ),
    index('messages_account_reply_hash_idx').on(table.accountId, sql`md5(${table.inReplyTo})`),
    index('messages_attachments_idx').using('gin', table.attachments.op('jsonb_path_ops')),
  ],
);
