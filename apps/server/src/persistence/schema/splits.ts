import type { AccountId, SplitId, SplitRule, UserId } from '@relay/shared/domain';
import { boolean, index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { users } from './users';

export const splits = pgTable(
  'splits',
  {
    id: text('id').$type<SplitId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull(),
    rules: jsonb('rules').$type<SplitRule[]>().notNull(),
    exclusive: boolean('exclusive').notNull(),
    hideTasks: boolean('hide_tasks').notNull().default(false),
  },
  (table) => [index('splits_user_idx').on(table.userId, table.position)],
);
