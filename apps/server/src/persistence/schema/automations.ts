import type {
  AccountId,
  AutomationAction,
  AutomationAi,
  AutomationCondition,
  AutomationId,
  AutomationMatchMode,
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
    match: text('match').$type<AutomationMatchMode>().notNull().default('all'),
    conditions: jsonb('conditions').$type<AutomationCondition[]>().notNull(),
    exceptions: jsonb('exceptions').$type<AutomationCondition[]>().notNull().default([]),
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
  (table) => [
    primaryKey({ columns: [table.automationId, table.messageId] }),
    index('automation_runs_message_idx').on(table.messageId),
  ],
);

export const removedAutomationPresets = pgTable(
  'removed_automation_presets',
  {
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    preset: text('preset').$type<AutomationPreset>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.preset] })],
);
