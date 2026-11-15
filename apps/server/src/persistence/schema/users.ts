import type { DeviceId, DevicePlatform, UserId } from '@relay/shared/domain';
import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { timestampTz } from './columns';

export const users = pgTable(
  'users',
  {
    id: text('id').$type<UserId>().primaryKey(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestampTz('created_at').notNull(),
  },
  (table) => [uniqueIndex('users_email_unique').on(sql`lower(${table.email})`)],
);

export const devices = pgTable(
  'devices',
  {
    id: text('id').$type<DeviceId>().primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    platform: text('platform').$type<DevicePlatform>().notNull(),
    createdAt: timestampTz('created_at').notNull(),
    lastSeenAt: timestampTz('last_seen_at').notNull(),
    revokedAt: timestampTz('revoked_at'),
  },
  (table) => [index('devices_user_idx').on(table.userId)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    deviceId: text('device_id')
      .$type<DeviceId>()
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    familyId: text('family_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestampTz('expires_at').notNull(),
    createdAt: timestampTz('created_at').notNull(),
    rotatedAt: timestampTz('rotated_at'),
    revokedAt: timestampTz('revoked_at'),
  },
  (table) => [
    uniqueIndex('refresh_tokens_hash_unique').on(table.tokenHash),
    index('refresh_tokens_family_idx').on(table.familyId),
    index('refresh_tokens_device_idx').on(table.deviceId),
  ],
);
