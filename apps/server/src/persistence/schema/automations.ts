import type {
  AccountId,
  AutomationAction,
  AutomationAi,
  AutomationCondition,
  AutomationId,
  AutomationPreset,
  MessageId,
  UserId,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { users } from './users';

export const automations = pgTable(
  'automations',
  {
    id: text('id').$type<AutomationId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .$type<AccountId>()
      .references(() => mailAccounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: boolean('enabled').notNull(),
    position: integer('position').notNull(),
    preset: text('preset').$type<AutomationPreset>(),
    conditions: jsonb('conditions').$type<AutomationCondition[]>().notNull(),
    ai: jsonb('ai').$type<AutomationAi>().notNull(),
    actions: jsonb('actions').$type<AutomationAction[]>().notNull(),
  },
  (table) => [
    index('automations_user_idx').on(table.userId, table.position),
    uniqueIndex('automations_user_preset_idx')
      .on(table.userId, table.preset)
      .where(sql`preset is not null`),
  ],
);

export const automationRuns = pgTable(
  'automation_runs',
  {
    automationId: text('automation_id')
      .$type<AutomationId>()
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    messageId: text('message_id')
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestampTz('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.automationId, table.messageId] })],
);
