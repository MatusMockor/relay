import type { AccountId } from '@relay/shared/domain';
import { index, jsonb, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { timestampTz } from './columns';

export const pendingWork = pgTable(
  'pending_work',
  {
    accountId: text('account_id')
      .$type<AccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    ref: text('ref').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    revision: text('revision').notNull(),
    createdAt: timestampTz('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.kind, table.ref] }),
    index('pending_work_order_idx').on(table.accountId, table.kind, table.createdAt),
  ],
);
