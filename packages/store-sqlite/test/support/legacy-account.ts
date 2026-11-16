import type { Repositories } from '@relay/engine';
import type { MailAccount } from '@relay/shared/domain';
import type { SqliteDatabase } from '../../src';
import { buildAccount } from './fixtures';
import { type SeededAccount, seedMailboxes } from './seed';

export const insertLegacyAccount = (
  database: SqliteDatabase,
  overrides: Partial<MailAccount> = {},
): MailAccount => {
  const account = buildAccount(overrides);
  database.sqlite
    .prepare(
      `insert into accounts (id, user_id, provider, display_name, email, color, is_primary, sync_interval_seconds, settings, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      account.id,
      account.userId,
      account.provider,
      account.displayName,
      account.email,
      account.color,
      account.isPrimary ? 1 : 0,
      account.syncIntervalSeconds,
      JSON.stringify(account.settings),
      account.status,
      account.createdAt,
    );
  return account;
};

export const seedLegacyAccount = (
  database: SqliteDatabase,
  repositories: Repositories,
): Promise<SeededAccount> => seedMailboxes(repositories, insertLegacyAccount(database));
