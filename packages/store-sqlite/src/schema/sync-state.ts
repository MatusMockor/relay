import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { mailboxes } from './mailboxes';

export const syncState = sqliteTable(
  'sync_state',
  {
    mailboxId: text('mailbox_id')
      .primaryKey()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    uidValidity: integer('uid_validity').notNull(),
    lastUid: integer('last_uid').notNull(),
    highestModseq: text('highest_modseq'),
    uidNext: integer('uid_next'),
    messageCount: integer('message_count'),
    initialFloorUid: integer('initial_floor_uid'),
    initialCutoff: text('initial_cutoff'),
    syncedAt: text('synced_at').notNull(),
  },
  (table) => [index('sync_state_account_idx').on(table.accountId)],
);

export type SyncStateRow = typeof syncState.$inferSelect;
