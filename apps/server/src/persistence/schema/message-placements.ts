import type { MailboxId, MessageId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { bigint, index, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { mailboxes } from './mailboxes';
import { messages } from './messages';

export const messagePlacements = pgTable(
  'message_placements',
  {
    messageId: text('message_id')
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    mailboxId: text('mailbox_id')
      .$type<MailboxId>()
      .notNull()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    uid: bigint('uid', { mode: 'number' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.mailboxId] }),
    uniqueIndex('message_placements_mailbox_uid_unique')
      .on(table.mailboxId, table.uid)
      .where(sql`uid > 0`),
    index('message_placements_mailbox_uid_idx').on(table.mailboxId, table.uid, table.messageId),
  ],
);

export const messageAliases = pgTable('message_aliases', {
  aliasId: text('alias_id').$type<MessageId>().primaryKey(),
  messageId: text('message_id')
    .$type<MessageId>()
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
});
