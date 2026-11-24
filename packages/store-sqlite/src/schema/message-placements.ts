import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { mailboxes } from './mailboxes';
import { messages } from './messages';

export const messagePlacements = sqliteTable(
  'message_placements',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    mailboxId: text('mailbox_id')
      .notNull()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    uid: integer('uid').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.mailboxId] }),
    uniqueIndex('message_placements_mailbox_uid_unique')
      .on(table.mailboxId, table.uid)
      .where(sql`uid > 0`),
    index('message_placements_mailbox_uid_idx').on(table.mailboxId, table.uid, table.messageId),
  ],
);
