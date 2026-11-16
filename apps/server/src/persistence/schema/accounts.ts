import type {
  AccountId,
  AccountStatus,
  ImapSmtpSettings,
  MailProviderKind,
  UserId,
} from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { timestampTz } from './columns';
import { users } from './users';

export const mailAccounts = pgTable(
  'mail_accounts',
  {
    id: text('id').$type<AccountId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').$type<MailProviderKind>().notNull(),
    displayName: text('display_name').notNull(),
    senderName: text('sender_name'),
    email: text('email').notNull(),
    color: text('color').notNull(),
    isPrimary: boolean('is_primary').notNull(),
    syncIntervalSeconds: integer('sync_interval_seconds').notNull(),
    settings: jsonb('settings').$type<ImapSmtpSettings>().notNull(),
    status: text('status').$type<AccountStatus>().notNull(),
    lastError: text('last_error'),
    lastSyncedAt: timestampTz('last_synced_at'),
    createdAt: timestampTz('created_at').notNull(),
  },
  (table) => [
    index('mail_accounts_user_idx').on(table.userId, table.createdAt),
    uniqueIndex('mail_accounts_user_email_unique').on(table.userId, sql`lower(${table.email})`),
    uniqueIndex('mail_accounts_primary_unique')
      .on(table.userId)
      .where(sql`${table.isPrimary}`),
  ],
);

export const accountCredentials = pgTable('account_credentials', {
  accountId: text('account_id')
    .$type<AccountId>()
    .primaryKey()
    .references(() => mailAccounts.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .$type<UserId>()
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  envelope: text('envelope').notNull(),
  updatedAt: timestampTz('updated_at').notNull(),
});
