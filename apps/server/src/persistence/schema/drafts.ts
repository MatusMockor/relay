import type {
  AccountId,
  Address,
  AttachmentId,
  DraftId,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { timestampTz } from './columns';
import { messages } from './messages';
import { threads } from './threads';
import { users } from './users';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

export const drafts = pgTable(
  'drafts',
  {
    id: text('id').$type<DraftId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    to: jsonb('to_addresses').$type<Address[]>().notNull(),
    cc: jsonb('cc_addresses').$type<Address[]>().notNull(),
    bcc: jsonb('bcc_addresses').$type<Address[]>().notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    inReplyToThreadId: text('in_reply_to_thread_id')
      .$type<ThreadId>()
      .references(() => threads.id, { onDelete: 'set null' }),
    inReplyToMessageId: text('in_reply_to_message_id')
      .$type<MessageId>()
      .references(() => messages.id, { onDelete: 'set null' }),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
    sendClaimedAt: timestampTz('send_claimed_at'),
  },
  (table) => [
    index('drafts_user_idx').on(table.userId, table.updatedAt.desc()),
    index('drafts_thread_idx').on(table.inReplyToThreadId),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    id: text('id')
      .$type<AttachmentId>()
      .primaryKey()
      .default(sql`replace(gen_random_uuid()::text, '-', '')`),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    size: integer('size').notNull(),
    content: bytea('content').notNull(),
    createdAt: timestampTz('created_at').notNull().defaultNow(),
  },
  (table) => [index('attachments_user_idx').on(table.userId)],
);

export const draftAttachments = pgTable(
  'draft_attachments',
  {
    draftId: text('draft_id')
      .$type<DraftId>()
      .notNull()
      .references(() => drafts.id, { onDelete: 'cascade' }),
    attachmentId: text('attachment_id')
      .$type<AttachmentId>()
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.draftId, table.attachmentId] }),
    uniqueIndex('draft_attachments_attachment_unique').on(table.attachmentId),
  ],
);
