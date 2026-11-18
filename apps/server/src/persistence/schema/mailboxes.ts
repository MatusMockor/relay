import type { AccountId, MailboxId, MailboxRole, UserId } from '@relay/shared/domain';
import { bigint, boolean, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { timestampTz } from './columns';
import { users } from './users';

export const mailboxes = pgTable(
  'mailboxes',
  {
    id: text('id').$type<MailboxId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    path: text('path').notNull(),
    delimiter: text('delimiter'),
    role: text('role').$type<MailboxRole>().notNull(),
    subscribed: boolean('subscribed').notNull().default(true),
    uidValidity: bigint('uid_validity', { mode: 'number' }),
    unreadCount: integer('unread_count').notNull(),
    totalCount: integer('total_count').notNull(),
  },
  (table) => [
    uniqueIndex('mailboxes_account_path_unique').on(table.accountId, table.path),
    index('mailboxes_account_role_idx').on(table.accountId, table.role),
    index('mailboxes_user_idx').on(table.userId),
  ],
);

export const syncState = pgTable('sync_state', {
  mailboxId: text('mailbox_id')
    .$type<MailboxId>()
    .primaryKey()
    .references(() => mailboxes.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .$type<UserId>()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .$type<AccountId>()
    .notNull()
    .references(() => mailAccounts.id, { onDelete: 'cascade' }),
  uidValidity: bigint('uid_validity', { mode: 'number' }).notNull(),
  lastUid: bigint('last_uid', { mode: 'number' }).notNull(),
  highestModseq: text('highest_modseq'),
  uidNext: bigint('uid_next', { mode: 'number' }),
  messageCount: integer('message_count'),
  initialFloorUid: bigint('initial_floor_uid', { mode: 'number' }),
  initialCutoff: timestampTz('initial_cutoff'),
  syncedAt: timestampTz('synced_at').notNull(),
});
