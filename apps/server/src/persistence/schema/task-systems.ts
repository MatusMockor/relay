import type {
  TaskSystemConnectionId,
  TaskSystemConnectionStatus,
  TaskSystemProvider,
  UserId,
} from '@relay/shared/domain';
import { pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { timestampTz } from './columns';
import { users } from './users';

export const taskSystemConnections = pgTable(
  'task_system_connections',
  {
    id: text('id').$type<TaskSystemConnectionId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<TaskSystemProvider>().notNull(),
    label: text('label').notNull(),
    siteUrl: text('site_url').notNull(),
    accountName: text('account_name').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    credentialsEnvelope: text('credentials_envelope'),
    status: text('status').$type<TaskSystemConnectionStatus>().notNull(),
    lastError: text('last_error'),
    createdAt: timestampTz('created_at').notNull(),
    updatedAt: timestampTz('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('task_system_connections_account_unique').on(
      table.userId,
      table.provider,
      table.siteUrl,
      table.externalAccountId,
    ),
  ],
);

export type TaskSystemConnectionRow = typeof taskSystemConnections.$inferSelect;
