import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';

export const pendingWork = sqliteTable(
  'pending_work',
  {
    accountId: text('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    ref: text('ref').notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
    revision: text('revision').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.kind, table.ref] }),
    index('pending_work_order_idx').on(table.accountId, table.kind, table.createdAt),
  ],
);

export type PendingWorkRow = typeof pendingWork.$inferSelect;
