import type { UserId, UserSettings } from '@relay/shared/domain';
import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { timestampTz } from './columns';
import { users } from './users';

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .$type<UserId>()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  settings: jsonb('settings').$type<UserSettings>().notNull(),
  updatedAt: timestampTz('updated_at').notNull().defaultNow(),
});
