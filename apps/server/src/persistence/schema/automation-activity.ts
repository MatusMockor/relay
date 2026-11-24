import type {
  AccountId,
  Address,
  AutomationActivityAction,
  AutomationActivityId,
  AutomationActivitySource,
  AutomationId,
  MessageId,
  ThreadId,
  UserId,
} from '@relay/shared/domain';
import { index, integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { mailAccounts } from './accounts';
import { automations } from './automations';
import { timestampTz } from './columns';
import { users } from './users';

export const automationActivity = pgTable(
  'automation_activity',
  {
    id: text('id').$type<AutomationActivityId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    automationId: text('automation_id')
      .$type<AutomationId>()
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .notNull()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    threadId: text('thread_id').$type<ThreadId>().notNull(),
    messageId: text('message_id').$type<MessageId>().notNull(),
    source: text('source').$type<AutomationActivitySource>().notNull(),
    sender: jsonb('sender').$type<Address | null>(),
    subject: text('subject').notNull(),
    actions: jsonb('actions').$type<AutomationActivityAction[]>().notNull(),
    failedCount: integer('failed_count').notNull(),
    createdAt: timestampTz('created_at').notNull(),
    undoneAt: timestampTz('undone_at'),
  },
  (table) => [
    index('automation_activity_user_automation_created_idx').on(
      table.userId,
      table.automationId,
      table.createdAt,
    ),
  ],
);
