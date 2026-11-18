import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { accounts } from './accounts';

export const automations = sqliteTable(
  'automations',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    accountId: text('account_id').references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull(),
    position: integer('position').notNull(),
    preset: text('preset'),
    conditions: text('conditions', { mode: 'json' }).notNull(),
    ai: text('ai', { mode: 'json' }).notNull(),
    actions: text('actions', { mode: 'json' }).notNull(),
  },
  (table) => [
    index('automations_user_position_idx').on(table.userId, table.position),
    uniqueIndex('automations_user_preset_idx')
      .on(table.userId, table.preset)
      .where(sql`preset is not null`),
  ],
);

export type AutomationRow = typeof automations.$inferSelect;

export const automationRuns = sqliteTable(
  'automation_runs',
  {
    automationId: text('automation_id')
      .notNull()
      .references(() => automations.id, { onDelete: 'cascade' }),
    messageId: text('message_id').notNull(),
    userId: text('user_id').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.automationId, table.messageId] })],
);

export const removedAutomationPresets = sqliteTable(
  'removed_automation_presets',
  {
    userId: text('user_id').notNull(),
    preset: text('preset').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.preset] })],
);
