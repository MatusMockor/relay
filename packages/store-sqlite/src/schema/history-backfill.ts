import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';
import { mailboxes } from './mailboxes';

export const historyBackfill = sqliteTable(
  'history_backfill',
  {
    mailboxId: text('mailbox_id')
      .primaryKey()
      .references(() => mailboxes.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    uidValidity: integer('uid_validity').notNull(),
    belowUid: integer('below_uid').notNull(),
    doneAt: text('done_at'),
    updatedAt: text('updated_at').notNull(),
    flagScanOffset: integer('flag_scan_offset').notNull().default(0),
  },
  (table) => [index('history_backfill_account_idx').on(table.accountId)],
);

export type HistoryBackfillRow = typeof historyBackfill.$inferSelect;
export type HistoryBackfillInsert = typeof historyBackfill.$inferInsert;
